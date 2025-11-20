// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, TurnState } from "@microsoft/agents-hosting";
import { PerplexityClient } from "./perplexityClient.js";
import {
  AgentNotificationActivity,
  NotificationType,
} from "@microsoft/agents-a365-notifications";
import {
  MentionInWordValue,
  SendEmailActivity,
  SendTeamsMessageActivity,
} from "./playgroundActivityTypes.js";
import {
  AgentDetails,
  ExecuteToolScope,
  TenantDetails,
  type InvokeAgentScope,
  type ToolCallDetails,
} from "@microsoft/agents-a365-observability";
import {
  extractAgentDetailsFromTurnContext,
  extractTenantDetailsFromTurnContext,
} from "./telemetryHelpers.js";

enum GuardContext {
  Message = "Message",
  Notification = "Notification",
}

/**
 * Perplexity Agent class handling message and notification activities.
 */
export class PerplexityAgent {
  isApplicationInstalled: boolean = false;
  termsAndConditionsAccepted: boolean = false;
  authorization: any;

  constructor(authorization: any) {
    this.authorization = authorization;
  }

  /**
   * Handles incoming user messages and sends responses using Perplexity.
   * - Validates installation and T&Cs.
   * - Calls Perplexity with streaming where supported.
   * - Performs a demo tool call (also with streaming "thinking" indicator).
   * - Records telemetry markers on all major paths (input/output/error only).
   */
  async handleAgentMessageActivity(
    turnContext: TurnContext,
    _state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    // 1️⃣ Guard: app must be installed
    if (
      !(await this.ensureApplicationInstalled(
        turnContext,
        invokeScope,
        GuardContext.Message
      ))
    ) {
      return;
    }

    // 2️⃣ Guard: terms must be accepted
    if (
      !(await this.ensureTermsAccepted(
        turnContext,
        invokeScope,
        GuardContext.Message
      ))
    ) {
      return;
    }

    // 3️⃣ Guard: must have a non-empty message
    const userMessage = await this.ensureUserMessage(turnContext, invokeScope);
    if (!userMessage) {
      return;
    }

    // 4️⃣ Main Perplexity + tool flow (with streaming + telemetry)
    await this.runChatAndToolFlow(turnContext, userMessage, invokeScope);
  }

  /**
   *  Ensures the application is installed; if not, prompts the user.
   * @param turnContext The context of the current turn.
   * @param invokeScope The scope for invoking the agent.
   * @param context The guard context (Message or Notification).
   * @returns True if installed, false otherwise.
   */
  private async ensureApplicationInstalled(
    turnContext: TurnContext,
    invokeScope: InvokeAgentScope | undefined,
    context: GuardContext
  ): Promise<boolean> {
    if (this.isApplicationInstalled) {
      return true;
    }

    // "Message" -> "messages", "Notification" -> "notifications"
    const noun = `${context.toLowerCase()}s`;

    invokeScope?.recordOutputMessages([`${context} path: AppNotInstalled`]);

    await turnContext.sendActivity(
      `Please install the application before sending ${noun}.`
    );
    return false;
  }

  /**
   * Ensures the terms and conditions are accepted; if not, prompts the user.
   * @param turnContext The context of the current turn.
   * @param invokeScope The scope for invoking the agent.
   * @param context The guard context (Message or Notification).
   * @returns True if terms accepted, false otherwise.
   */
  private async ensureTermsAccepted(
    turnContext: TurnContext,
    invokeScope: InvokeAgentScope | undefined,
    context: GuardContext
  ): Promise<boolean> {
    if (this.termsAndConditionsAccepted) {
      return true;
    }

    const text = turnContext.activity.text?.trim().toLowerCase();

    if (text === "i accept") {
      this.termsAndConditionsAccepted = true;

      invokeScope?.recordOutputMessages([
        `${context} path: TermsAcceptedOn${context}`,
      ]);

      await turnContext.sendActivity(
        "Thank you for accepting the terms and conditions! How can I assist you today?"
      );
      return false; // completes the turn
    }

    invokeScope?.recordOutputMessages([`${context} path: TermsNotYetAccepted`]);

    await turnContext.sendActivity(
      "Please accept the terms and conditions to proceed. Send 'I accept' to accept."
    );
    return false;
  }

  /**
   *  Ensures the user message is non-empty; if empty, prompts the user.
   * @param turnContext The context of the current turn.
   * @param invokeScope The scope for invoking the agent.
   * @returns The user's message if present, otherwise null.
   */
  private async ensureUserMessage(
    turnContext: TurnContext,
    invokeScope?: InvokeAgentScope
  ): Promise<string | null> {
    const userMessage = turnContext.activity.text?.trim() || "";

    if (!userMessage) {
      invokeScope?.recordOutputMessages(["Message path: EmptyUserMessage"]);

      await turnContext.sendActivity(
        "Please send me a message and I'll help you!"
      );
      return null;
    }

    return userMessage;
  }

  /**
   *  Runs the main chat and tool flow.
   * @param turnContext The context of the current turn.
   * @param userMessage The user's message.
   * @param invokeScope The scope for invoking the agent.
   */
  private async runChatAndToolFlow(
    turnContext: TurnContext,
    userMessage: string,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    const streamingResponse = (turnContext as any).streamingResponse;
    const perplexityClient = this.getPerplexityClient();

    try {
      invokeScope?.recordInputMessages([userMessage]);

      if (streamingResponse) {
        streamingResponse.queueInformativeUpdate(
          "I'm working on your request..."
        );
      }

      invokeScope?.recordOutputMessages([
        "Message path: PerplexityInvocationStarted",
      ]);

      const response = await perplexityClient.invokeAgentWithScope(userMessage);

      invokeScope?.recordOutputMessages([
        "Message path: PerplexityInvocationSucceeded",
      ]);

      if (streamingResponse) {
        streamingResponse.queueTextChunk(response);
      } else {
        await turnContext.sendActivity(response);
      }

      // Demo tool call (streaming “thinking” + response inside)
      await this.performToolCall(turnContext, invokeScope);

      if (streamingResponse) {
        await streamingResponse.endStream();
      }

      invokeScope?.recordOutputMessages([
        "Message path: CompletedSuccessfully",
      ]);
    } catch (error) {
      const err = error as any;
      const errorMessage = `Error: ${err.message || err}`;

      invokeScope?.recordError(error as Error);
      invokeScope?.recordOutputMessages([
        "Message path: PerplexityOrToolError",
        errorMessage,
      ]);

      if (streamingResponse) {
        streamingResponse.queueTextChunk(errorMessage);
        await streamingResponse.endStream();
      } else {
        await turnContext.sendActivity(errorMessage);
      }
    }
  }

  /**
   * Handles agent notification activities by parsing the activity type.
   */
  async handleAgentNotificationActivity(
    turnContext: TurnContext,
    state: TurnState,
    agentNotificationActivity: AgentNotificationActivity,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    try {
      if (
        !(await this.ensureApplicationInstalled(
          turnContext,
          invokeScope,
          GuardContext.Notification
        ))
      ) {
        return;
      }

      if (
        !(await this.ensureTermsAccepted(
          turnContext,
          invokeScope,
          GuardContext.Notification
        ))
      ) {
        return;
      }

      // Route to specific handlers
      switch (agentNotificationActivity.notificationType) {
        case NotificationType.EmailNotification:
          invokeScope?.recordOutputMessages([
            "Notification path: EmailNotificationHandler",
          ]);

          await this.emailNotificationHandler(
            turnContext,
            state,
            agentNotificationActivity,
            invokeScope
          );
          break;

        case NotificationType.WpxComment:
          invokeScope?.recordOutputMessages([
            "Notification path: WordNotificationHandler",
          ]);

          await this.wordNotificationHandler(
            turnContext,
            state,
            agentNotificationActivity,
            invokeScope
          );
          break;

        default:
          invokeScope?.recordOutputMessages([
            "Notification path: UnsupportedNotificationType",
            "Notification_UnsupportedType",
          ]);

          await turnContext.sendActivity(
            "Notification type not yet implemented."
          );
      }
    } catch (error) {
      const err = error as any;

      invokeScope?.recordError(error as Error);
      invokeScope?.recordOutputMessages([
        "Notification path: HandlerException",
        `Error handling notification: ${err.message || err}`,
        "Notification_Error",
      ]);

      await turnContext.sendActivity(
        `Error handling notification: ${err.message || err}`
      );
    }
  }

  /**
   * Handles agent installation and removal events.
   * Instant responses only (no streaming).
   */
  async handleInstallationUpdateActivity(
    turnContext: TurnContext,
    _state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    const action = (turnContext.activity as any).action;

    if (action === "add") {
      this.isApplicationInstalled = true;
      this.termsAndConditionsAccepted = false;

      invokeScope?.recordOutputMessages([
        "Installation path: Added",
        "Installation_Add",
      ]);

      await turnContext.sendActivity(
        'Thank you for hiring me! Looking forward to assisting you with Perplexity AI! Before I begin, could you please confirm that you accept the terms and conditions? Send "I accept" to accept.'
      );
    } else if (action === "remove") {
      this.isApplicationInstalled = false;
      this.termsAndConditionsAccepted = false;

      invokeScope?.recordOutputMessages([
        "Installation path: Removed",
        "Installation_Remove",
      ]);

      await turnContext.sendActivity(
        "Thank you for your time, I enjoyed working with you."
      );
    } else {
      invokeScope?.recordOutputMessages([
        "Installation path: UnknownAction",
        "Installation_UnknownAction",
      ]);
    }
  }

  /**
   * Handles @-mention notification activities (real Word notifications).
   * Long-running: Perplexity calls + streaming visuals where supported.
   */
  async wordNotificationHandler(
    turnContext: TurnContext,
    _state: TurnState,
    mentionActivity: AgentNotificationActivity,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages(["WordNotification path: Starting"]);

    const stream = this.getStreamingOrFallback(turnContext);
    await stream.sendProgress(
      "Thanks for the @-mention notification! Working on a response..."
    );

    const mentionNotificationEntity = mentionActivity.wpxCommentNotification;

    if (!mentionNotificationEntity) {
      invokeScope?.recordOutputMessages([
        "WordNotification path: MissingEntity",
        "WordNotification_MissingEntity",
      ]);

      const msg = "I could not find the mention notification details.";
      await stream.sendFinal(msg);
      return;
    }

    const documentId = mentionNotificationEntity.documentId;
    const odataId = mentionNotificationEntity["odata.id"];
    const initiatingCommentId = mentionNotificationEntity.initiatingCommentId;
    const subjectCommentId = mentionNotificationEntity.subjectCommentId;

    const mentionPrompt = `You have been mentioned in a Word document.
      Document ID: ${documentId || "N/A"}
      OData ID: ${odataId || "N/A"}
      Initiating Comment ID: ${initiatingCommentId || "N/A"}
      Subject Comment ID: ${subjectCommentId || "N/A"}
      Please retrieve the text of the initiating comment and return it in plain text.`;

    const perplexityClient = this.getPerplexityClient();
    const commentContent = await perplexityClient.invokeAgentWithScope(
      mentionPrompt
    );
    const response = await perplexityClient.invokeAgentWithScope(
      `You have received the following comment. Please follow any instructions in it. ${commentContent}`
    );

    invokeScope?.recordOutputMessages([
      "WordNotification path: Completed",
      "WordNotification_Success",
    ]);

    await stream.sendFinal(response);
  }

  /**
   * Handles email notification activities (real email notifications).
   * Long-running: Perplexity calls + streaming visuals where supported.
   */
  async emailNotificationHandler(
    turnContext: TurnContext,
    _state: TurnState,
    emailActivity: AgentNotificationActivity,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages(["EmailNotification path: Starting"]);

    const stream = this.getStreamingOrFallback(turnContext);
    await stream.sendProgress(
      "Thanks for the email notification! Working on a response..."
    );

    const emailNotificationEntity = emailActivity.emailNotification;

    if (!emailNotificationEntity) {
      invokeScope?.recordOutputMessages([
        "EmailNotification path: MissingEntity",
        "EmailNotification_MissingEntity",
      ]);

      const msg = "I could not find the email notification details.";
      await stream.sendFinal(msg);
      return;
    }

    const emailNotificationId = emailNotificationEntity.id;
    const emailNotificationConversationId =
      emailNotificationEntity.conversationId;
    const emailNotificationConversationIndex =
      emailNotificationEntity.conversationIndex;
    const emailNotificationChangeKey = emailNotificationEntity.changeKey;

    const perplexityClient = this.getPerplexityClient();
    const emailContent = await perplexityClient.invokeAgentWithScope(
      `You have a new email from ${turnContext.activity.from?.name} with id '${emailNotificationId}',
      ConversationId '${emailNotificationConversationId}', ConversationIndex '${emailNotificationConversationIndex}',
      and ChangeKey '${emailNotificationChangeKey}'. Please retrieve this message and return it in text format.`
    );

    const response = await perplexityClient.invokeAgentWithScope(
      `You have received the following email. Please follow any instructions in it. ${emailContent}`
    );

    invokeScope?.recordOutputMessages([
      "EmailNotification path: Completed",
      "EmailNotification_Success",
    ]);

    await stream.sendFinal(response);
  }

  /* ------------------------------------------------------------------
   * ✅ Playground handlers (telemetry only, no streaming for snappy UX)
   * ------------------------------------------------------------------ */

  async handlePlaygroundMentionInWord(
    turnContext: TurnContext,
    _state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages([
      "Playground_MentionInWord path: Starting",
    ]);

    const value = turnContext.activity.value as MentionInWordValue | undefined;

    if (!value || !value.mention) {
      const msg = "Invalid playground MentionInWord payload.";

      invokeScope?.recordOutputMessages([
        "Playground_MentionInWord path: InvalidPayload",
        "Playground_MentionInWord_InvalidPayload",
      ]);

      await turnContext.sendActivity(msg);
      return;
    }

    const docName: string = value.mention.displayName;
    const docUrl: string = value.docUrl;
    const userName: string = value.mention.userPrincipalName;
    const contextSnippet: string = value.context
      ? `Context: ${value.context}`
      : "";
    const message: string = `✅ You were mentioned in **${docName}** by ${userName}\n📄 ${docUrl}\n${contextSnippet}`;

    invokeScope?.recordOutputMessages([
      "Playground_MentionInWord path: Completed",
      "Playground_MentionInWord_Success",
    ]);

    await turnContext.sendActivity(message);
  }

  async handlePlaygroundSendEmail(
    turnContext: TurnContext,
    _state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages(["Playground_SendEmail path: Starting"]);

    const activity = turnContext.activity as SendEmailActivity;
    const email = activity.value;

    if (!email) {
      const msg = "Invalid playground SendEmail payload.";

      invokeScope?.recordOutputMessages([
        "Playground_SendEmail path: InvalidPayload",
        "Playground_SendEmail_InvalidPayload",
      ]);

      await turnContext.sendActivity(msg);
      return;
    }

    const message: string = `📧 Email Notification:
      From: ${email.from}
      To: ${email.to?.join(", ")}
      Subject: ${email.subject}
      Body: ${email.body}`;

    invokeScope?.recordOutputMessages([
      "Playground_SendEmail path: Completed",
      "Playground_SendEmail_Success",
    ]);

    await turnContext.sendActivity(message);
  }

  async handlePlaygroundSendTeamsMessage(
    turnContext: TurnContext,
    _state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages([
      "Playground_SendTeamsMessage path: Starting",
    ]);

    const activity = turnContext.activity as SendTeamsMessageActivity;
    const value = activity.value;

    if (!value) {
      const msg = "Invalid playground SendTeamsMessage payload.";

      invokeScope?.recordOutputMessages([
        "Playground_SendTeamsMessage path: InvalidPayload",
        "Playground_SendTeamsMessage_InvalidPayload",
      ]);

      await turnContext.sendActivity(msg);
      return;
    }

    const message = `💬 Teams Message: ${value.text} (Scope: ${value.destination?.scope})`;

    invokeScope?.recordOutputMessages([
      "Playground_SendTeamsMessage path: Completed",
      "Playground_SendTeamsMessage_Success",
    ]);

    await turnContext.sendActivity(message);
  }

  async handlePlaygroundCustom(
    turnContext: TurnContext,
    _state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages(["Playground_Custom path: Starting"]);

    const message = "this is a custom activity handler";

    invokeScope?.recordOutputMessages([
      "Playground_Custom path: Completed",
      "Playground_Custom_Success",
    ]);

    await turnContext.sendActivity(message);
  }

  /**
   * Creates a Perplexity client instance with configured API key.
   */
  private getPerplexityClient(): PerplexityClient {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error("PERPLEXITY_API_KEY environment variable is not set");
    }

    const model = process.env.PERPLEXITY_MODEL || "sonar";
    return new PerplexityClient(apiKey, model);
  }

  /**
   * Helper for handling streaming vs non-streaming surfaces in a unified way.
   * For streaming-enabled clients, we use queueInformativeUpdate / queueTextChunk + endStream.
   * For others, we only send the final response.
   */
  private getStreamingOrFallback(turnContext: TurnContext) {
    const streamingResponse = (turnContext as any).streamingResponse;

    return {
      hasStreaming: !!streamingResponse,
      async sendProgress(message: string): Promise<void> {
        if (streamingResponse) {
          streamingResponse.queueInformativeUpdate(message);
        }
        // For non-streaming surfaces, skip progress bubbles to avoid double messages.
      },
      async sendFinal(message: string): Promise<void> {
        if (streamingResponse) {
          streamingResponse.queueTextChunk(message);
          await streamingResponse.endStream();
        } else {
          await turnContext.sendActivity(message);
        }
      },
    };
  }

  /**
   * Simple demo tool call wrapped in ExecuteToolScope so it shows up
   * as a child "tool" span under the main invoke_agent span.
   */
  private async performToolCall(
    turnContext: TurnContext,
    invokeScope?: InvokeAgentScope
  ): Promise<string> {
    const agentDetails = extractAgentDetailsFromTurnContext(
      turnContext
    ) as AgentDetails;
    const tenantDetails = extractTenantDetailsFromTurnContext(
      turnContext
    ) as TenantDetails;

    const toolDetails: ToolCallDetails = {
      toolName: "send-email-demo",
      toolCallId: `tool-${Date.now()}`,
      description: "Demo tool that pretends to send an email",
      arguments: JSON.stringify({
        recipient: "user@example.com",
        subject: "Hello",
        body: "Test email from demo tool",
      }),
      toolType: "function",
    };

    const toolScope = ExecuteToolScope.start(
      toolDetails,
      agentDetails,
      tenantDetails
    );

    try {
      let result: string;

      if (toolScope) {
        result = await toolScope.withActiveSpanAsync(() =>
          this.runDemoToolWork(turnContext, toolScope)
        );
      } else {
        result = await this.runDemoToolWork(turnContext);
      }

      invokeScope?.recordOutputMessages([
        "ToolCall path: Completed",
        "ToolCall_Success",
      ]);
      return result;
    } catch (error) {
      toolScope?.recordError(error as Error);
      invokeScope?.recordOutputMessages([
        "ToolCall path: Error",
        "ToolCall_Error",
      ]);
      throw error;
    } finally {
      toolScope?.dispose();
    }
  }

  /**
   * Core demo tool logic:
   * - Shows a "thinking" / progress indicator
   * - Waits ~2 seconds
   * - Emits the "Tool Response" message
   * - Records the response on the tool span (if present)
   *
   * Streaming vs non-streaming is handled here, but we do NOT end the stream.
   */
  private async runDemoToolWork(
    turnContext: TurnContext,
    toolScope?: ExecuteToolScope
  ): Promise<string> {
    const streamingResponse = (turnContext as any).streamingResponse;

    // Progress / thinking indicator
    if (streamingResponse) {
      streamingResponse.queueInformativeUpdate("Now performing a tool call...");
    } else {
      await turnContext.sendActivity("Now performing a tool call...");
    }

    // Simulate tool latency
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = "Email sent successfully to user@example.com";

    // Emit tool result
    if (streamingResponse) {
      streamingResponse.queueTextChunk(`Tool Response: ${response}`);
    } else {
      await turnContext.sendActivity(`Tool Response: ${response}`);
    }

    // Telemetry on the tool span, if available
    toolScope?.recordResponse(response);

    return response;
  }
}
