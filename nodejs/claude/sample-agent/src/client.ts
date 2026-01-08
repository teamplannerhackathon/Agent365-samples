// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// import { Options, query } from '@anthropic-ai/claude-agent-sdk'; // REMOVED: ES Module import
import type { Options } from '@anthropic-ai/claude-agent-sdk'; // Type-only import
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import * as path from 'path';

import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';

// Observability Imports
import {
  ObservabilityManager,
  InferenceScope,
  Builder,
  InferenceOperationType,
  AgentDetails,
  TenantDetails,
  InferenceDetails,
  Agent365ExporterOptions,
} from '@microsoft/agents-a365-observability';
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';
import { tokenResolver } from './token-cache';

export interface Client {
  invokeAgentWithScope(prompt: string): Promise<string>;
}

export const a365Observability = ObservabilityManager.configure((builder: Builder) => {
  const exporterOptions = new Agent365ExporterOptions();
  exporterOptions.maxQueueSize = 10; // customized queue size

  builder
    .withService('TypeScript Claude Sample Agent', '1.0.0')
    .withExporterOptions(exporterOptions);

  // Configure token resolver if using Agent 365 exporter; otherwise console exporter is used
  if (process.env.Use_Custom_Resolver === 'true') {
    builder.withTokenResolver(tokenResolver);
  } else {
    // use built-in token resolver from observability hosting package
    builder.withTokenResolver((agentId: string, tenantId: string) =>
      AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId)
    );
  }
});

a365Observability.start();

const toolService = new McpToolRegistrationService();

// Claude agent configuration with automatic skill loading
const agentConfig: Options = {
  maxTurns: 10,
  env: { ...process.env },
  // Set working directory to find .claude/skills/ - use __dirname to get the src directory, then go up one level
  cwd: path.join(__dirname, '..'),
  // Configure automatic skill loading from filesystem
  settingSources: ["user", "project"],  // Required to load Skills
  allowedTools: ["Skill"],
  systemPrompt: `You are a helpful assistant with access to tools and Claude Skills for enhanced functionality.

🎯 SKILLS USAGE:
You have access to specialized skills that should be used automatically when relevant to user requests. Always check if there are skills available that match the user's needs and invoke them proactively.

📧 EMAIL HANDLING:
When users ask you to send emails, compose emails, or create email content:
1. AUTOMATICALLY invoke the email skill to format and enhance the content with proper HTML structure and signatures
2. Use the available Mail tools to actually send the emails
3. Combine skills and tools to provide the best user experience

Always use skills and tools to provide the best possible assistance. When in doubt about whether to use a skill, err on the side of using it.`
};

delete agentConfig.env!.NODE_OPTIONS; // Remove NODE_OPTIONS to prevent issues
delete agentConfig.env!.VSCODE_INSPECTOR_OPTIONS; // Remove VSCODE_INSPECTOR_OPTIONS to prevent issues

export async function getClient(authorization: Authorization, authHandlerName: string, turnContext: TurnContext): Promise<Client> {
  try {
    console.log('🔧 Registering MCP tool servers from ToolingManifest...');
    await toolService.addToolServersToAgent(
      agentConfig,
      authorization,
      authHandlerName,
      turnContext,
      process.env.BEARER_TOKEN || "",
    );
    console.log('✅ Successfully registered MCP tool servers');
  } catch (error) {
    console.warn('❌ Failed to register MCP tool servers:', error);
  }

  return new ClaudeClient(agentConfig, authorization, authHandlerName, turnContext);
}

/**
 * ClaudeClient provides an interface to interact with the Claude Agent SDK.
 * It maintains agentConfig as an instance field and exposes an invokeAgent method.
 */
class ClaudeClient implements Client {
  config: Options;
  private claudeSDK: any = null;
  private authorization?: Authorization;
  private authHandlerName?: string;
  private turnContext?: TurnContext;

  constructor(config: Options, authorization?: Authorization, authHandlerName?: string, turnContext?: TurnContext) {
    this.config = config;
    this.authorization = authorization;
    this.authHandlerName = authHandlerName;
    this.turnContext = turnContext;
  }

  private async loadClaudeSDK() {
    if (!this.claudeSDK) {
      console.log('🚨 LOADING CLAUDE SDK - Dynamic Import');
      const importFn = new Function('specifier', 'return import(specifier)');
      this.claudeSDK = await importFn('@anthropic-ai/claude-agent-sdk');
      console.log('🚨 CLAUDE SDK LOADED SUCCESSFULLY');
    }
    return this.claudeSDK;
  }

  /**
   * Sends a user message to the Claude Agent SDK and returns the AI's response.
   * Skills are now automatically discovered and invoked by Claude based on their descriptions.
   *
   * @param {string} userMessage - The message or prompt to send to Claude.
   * @returns {Promise<string>} The response from Claude, or an error message if the query fails.
   */
  async invokeAgent(prompt: string): Promise<string> {
    return await this.executeClaudeQuery(prompt);
  }

  private async executeClaudeQuery(prompt: string): Promise<string> {
    try {
      console.log('🔧 DEBUG: About to call Claude SDK query');
      console.log('🔧 DEBUG: API Key present:', !!process.env.ANTHROPIC_API_KEY);
      console.log('🔧 DEBUG: API Key starts with:', process.env.ANTHROPIC_API_KEY?.substring(0, 20));
      console.log('🔧 DEBUG: Skills directory exists:', require('fs').existsSync('.claude/skills'));
      console.log('🔧 DEBUG: Working directory:', process.cwd());
      
      const claudeSDK = await this.loadClaudeSDK();
      const { query } = claudeSDK;
      
      console.log('🔧 DEBUG: Config being passed to Claude:', JSON.stringify(this.config, null, 2));
      
      const result = query({
        prompt,
        options: this.config,
      });

      let finalResponse = '';

      // Process streaming messages
      for await (const message of result) {
        if (message.type === 'result') {
          // Get the final output from the result message
          const resultContent = (message as any).result;
          if (resultContent) {
            finalResponse += resultContent;
          }
        }
      }

      return finalResponse || "Sorry, I couldn't get a response from Claude :(";
    } catch (error) {
      console.error('Claude agent error:', error);
      const err = error as any;
      return `Error: ${err.message || err}`;
    }
  }

  async invokeAgentWithScope(prompt: string) {
    const inferenceDetails: InferenceDetails = {
      operationName: InferenceOperationType.CHAT,
      model: this.config.model || "",
    };

    const agentDetails: AgentDetails = {
      agentId: 'claude-travel-agent',
      agentName: 'Claude Travel Agent',
      conversationId: 'conv-12345',
    };

    const tenantDetails: TenantDetails = {
      tenantId: 'claude-sample-tenant',
    };

    const scope = InferenceScope.start(inferenceDetails, agentDetails, tenantDetails);

    const response = await this.invokeAgent(prompt);

    // Record the inference response with token usage
    scope?.recordOutputMessages([response]);
    scope?.recordInputMessages([prompt]);
    scope?.recordResponseId(`resp-${Date.now()}`);
    scope?.recordInputTokens(45);
    scope?.recordOutputTokens(78);
    scope?.recordFinishReasons(['stop']);

    return response;
  }
}
