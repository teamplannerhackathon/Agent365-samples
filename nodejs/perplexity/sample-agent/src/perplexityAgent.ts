// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, TurnState } from "@microsoft/agents-hosting";
import { PerplexityClient } from "./perplexityClient.js";
import {
  AgentNotificationActivity,
  NotificationType,
} from "@microsoft/agents-a365-notifications";
import type { InvokeAgentScope } from "@microsoft/agents-a365-observability";

/**
 * Helper for handling streaming vs non-streaming surfaces in a unified way.
 * For streaming-enabled clients, we use queueInformativeUpdate / queueTextChunk + endStream.
 * For others, we fall back to sendActivity.
 */
function getStreamingOrFallback(turnContext: TurnContext) {
  const streamingResponse = (turnContext as any).streamingResponse;

  return {
    hasStreaming: !!streamingResponse,
    async sendProgress(message: string): Promise<void> {
      if (streamingResponse) {
        streamingResponse.queueInformativeUpdate(message);
      } else {
        await turnContext.sendActivity(message);
      }
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
 * PerplexityAgent integrates with the Perplexity AI SDK to handle user messages
 * and agent notification activities. It manages installation state, terms acceptance,
 * and routes messages to the PerplexityClient for processing.
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
   */
  async handleAgentMessageActivity(
    turnContext: TurnContext,
    state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    if (!this.isApplicationInstalled) {
      invokeScope?.recordOutputMessages(["Message path: AppNotInstalled"]);
      invokeScope?.recordResponse("Message_AppNotInstalled");

      await turnContext.sendActivity(
        "Please install the application before sending messages."
      );
      return;
    }

    if (!this.termsAndConditionsAccepted) {
      const text = turnContext.activity.text?.trim().toLowerCase();

      if (text === "i accept") {
        this.termsAndConditionsAccepted = true;

        invokeScope?.recordOutputMessages([
          "Message path: TermsAcceptedOnMessage",
        ]);
        invokeScope?.recordResponse("Message_TermsAccepted");

        await turnContext.sendActivity(
          "Thank you for accepting the terms and conditions! How can I assist you today?"
        );
        return;
      } else {
        invokeScope?.recordOutputMessages([
          "Message path: TermsNotYetAccepted",
        ]);
        invokeScope?.recordResponse("Message_TermsNotAccepted");

        await turnContext.sendActivity(
          "Please accept the terms and conditions to proceed. Send 'I accept' to accept."
        );
        return;
      }
    }

    const userMessage = turnContext.activity.text?.trim() || "";

    if (!userMessage) {
      invokeScope?.recordOutputMessages(["Message path: EmptyUserMessage"]);
      invokeScope?.recordResponse("Message_Empty");

      await turnContext.sendActivity(
        "Please send me a message and I'll help you!"
      );
      return;
    }

    // Grab streamingResponse if this surface supports it
    const streamingResponse = (turnContext as any).streamingResponse;

    try {
      // Show temporary "I'm working" message with spinner (Playground, and any streaming-enabled client)
      if (streamingResponse) {
        streamingResponse.queueInformativeUpdate(
          "I'm working on your request..."
        );
      }

      const perplexityClient = this.getPerplexityClient();

      invokeScope?.recordOutputMessages([
        "Message path: PerplexityInvocationStarted",
      ]);

      const response = await perplexityClient.invokeAgentWithScope(userMessage);

      invokeScope?.recordOutputMessages([
        "Message path: PerplexityInvocationSucceeded",
      ]);

      if (streamingResponse) {
        // Send the final response as a streamed chunk
        streamingResponse.queueTextChunk(response);
        // Close the stream when done
        await streamingResponse.endStream();
      } else {
        // Fallback for channels that don't support streaming
        await turnContext.sendActivity(response);
      }

      invokeScope?.recordResponse("Message_Success");
    } catch (error) {
      console.error("Perplexity query error:", error);
      const err = error as any;
      const errorMessage = `Error: ${err.message || err}`;

      invokeScope?.recordError(error as Error);
      invokeScope?.recordOutputMessages([
        "Message path: PerplexityInvocationError",
        errorMessage,
      ]);
      invokeScope?.recordResponse("Message_Error");

      if (streamingResponse) {
        // Surface the error through the stream and close it
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
      if (!this.isApplicationInstalled) {
        invokeScope?.recordOutputMessages([
          "Notification path: AppNotInstalled",
        ]);
        invokeScope?.recordResponse("Notification_AppNotInstalled");

        await turnContext.sendActivity(
          "Please install the application before sending notifications."
        );
        return;
      }

      if (!this.termsAndConditionsAccepted) {
        const text = turnContext.activity.text?.trim().toLowerCase();

        if (text === "i accept") {
          this.termsAndConditionsAccepted = true;

          invokeScope?.recordOutputMessages([
            "Notification path: TermsAcceptedOnNotification",
          ]);
          invokeScope?.recordResponse("Notification_TermsAccepted");

          await turnContext.sendActivity(
            "Thank you for accepting the terms and conditions! How can I assist you today?"
          );
          return;
        } else {
          invokeScope?.recordOutputMessages([
            "Notification path: TermsNotYetAccepted",
          ]);
          invokeScope?.recordResponse("Notification_TermsNotAccepted");

          await turnContext.sendActivity(
            "Please accept the terms and conditions to proceed. Send 'I accept' to accept."
          );
          return;
        }
      }

      // Find the first known notification type entity
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
          ]);
          invokeScope?.recordResponse("Notification_UnsupportedType");

          await turnContext.sendActivity(
            "Notification type not yet implemented."
          );
      }
    } catch (error) {
      console.error("Error handling agent notification activity:", error);
      const err = error as any;

      invokeScope?.recordError(error as Error);
      invokeScope?.recordOutputMessages([
        "Notification path: HandlerException",
        `Error handling notification: ${err.message || err}`,
      ]);
      invokeScope?.recordResponse("Notification_Error");

      await turnContext.sendActivity(
        `Error handling notification: ${err.message || err}`
      );
    }
  }

  /**
   * Handles agent installation and removal events.
   */
  async handleInstallationUpdateActivity(
    turnContext: TurnContext,
    state: TurnState,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    const action = (turnContext.activity as any).action;

    if (action === "add") {
      this.isApplicationInstalled = true;
      this.termsAndConditionsAccepted = false;

      invokeScope?.recordOutputMessages(["Installation path: Added"]);
      invokeScope?.recordResponse("Installation_Add");

      await turnContext.sendActivity(
        'Thank you for hiring me! Looking forward to assisting you with Perplexity AI! Before I begin, could you please confirm that you accept the terms and conditions? Send "I accept" to accept.'
      );
    } else if (action === "remove") {
      this.isApplicationInstalled = false;
      this.termsAndConditionsAccepted = false;

      invokeScope?.recordOutputMessages(["Installation path: Removed"]);
      invokeScope?.recordResponse("Installation_Remove");

      await turnContext.sendActivity(
        "Thank you for your time, I enjoyed working with you."
      );
    } else {
      invokeScope?.recordOutputMessages(["Installation path: UnknownAction"]);
      invokeScope?.recordResponse("Installation_UnknownAction");
    }
  }

  /**
   * Handles @-mention notification activities.
   */
  async wordNotificationHandler(
    turnContext: TurnContext,
    state: TurnState,
    mentionActivity: AgentNotificationActivity,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages(["WordNotification path: Starting"]);

    const stream = getStreamingOrFallback(turnContext);

    await stream.sendProgress(
      "Thanks for the @-mention notification! Working on a response..."
    );

    const mentionNotificationEntity = mentionActivity.wpxCommentNotification;

    if (!mentionNotificationEntity) {
      invokeScope?.recordOutputMessages([
        "WordNotification path: MissingEntity",
      ]);
      invokeScope?.recordResponse("WordNotification_MissingEntity");

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

    invokeScope?.recordOutputMessages(["WordNotification path: Completed"]);
    invokeScope?.recordResponse("WordNotification_Success");

    await stream.sendFinal(response);
  }

  /**
   * Handles email notification activities.
   */
  async emailNotificationHandler(
    turnContext: TurnContext,
    state: TurnState,
    emailActivity: AgentNotificationActivity,
    invokeScope?: InvokeAgentScope
  ): Promise<void> {
    invokeScope?.recordOutputMessages(["EmailNotification path: Starting"]);

    const stream = getStreamingOrFallback(turnContext);

    await stream.sendProgress(
      "Thanks for the email notification! Working on a response..."
    );

    const emailNotificationEntity = emailActivity.emailNotification;

    if (!emailNotificationEntity) {
      invokeScope?.recordOutputMessages([
        "EmailNotification path: MissingEntity",
      ]);
      invokeScope?.recordResponse("EmailNotification_MissingEntity");

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

    invokeScope?.recordOutputMessages(["EmailNotification path: Completed"]);
    invokeScope?.recordResponse("EmailNotification_Success");

    await stream.sendFinal(response);
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
}
