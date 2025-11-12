# Code Walkthrough: LangChain Quickstart (Before)

> **🎯 Purpose**: This is a **minimal, simplified** agent implementation designed for learning. It shows the core structure before adding advanced features.

This document provides a detailed technical walkthrough of the simplified LangChain quickstart agent implementation. This is the "before" version that demonstrates the basic agent structure before adding advanced features like MCP tools, observability, and notifications.

## ⚠️ Important Context

This `quickstart-before` directory contains a **stripped-down version** of the full LangChain sample agent. It's intentionally minimal to help you:

1. **Understand the basics** without complexity
2. **See the core message flow** clearly
3. **Learn incrementally** by adding features step-by-step
4. **Compare with the full sample** to understand what each feature adds

**What's excluded** (intentionally):
- ❌ MCP tool integration
- ❌ Observability and telemetry
- ❌ Agent notification handling
- ❌ Advanced authentication configurations
- ❌ Custom error handling and logging

**For the complete implementation**, see the `sample-agent` directory.

## 📁 File Structure Overview

```
quickstart-before/
├── src/
│   ├── agent.ts               # 🔵 Main agent implementation (38 lines)
│   ├── client.ts              # 🔵 LangChain client factory and wrapper (no MCP tools)
│   └── index.ts               # 🔵 Express server entry point (minimal setup)
├── package.json               # 📦 Dependencies and scripts
├── tsconfig.json              # 🔧 TypeScript configuration
├── env.TEMPLATE               # ⚙️ Environment template
└── Documentation files...
```

## 🏗️ Architecture Overview

### Key Components
```
┌─────────────────────────────────────────────────────┐
│                agent.ts Structure                   │
├─────────────────────────────────────────────────────┤
│  Imports & Dependencies              (Lines 1-5)    │
│  MyAgent Class                      (Lines 7-37)    │
│   ├── Constructor & Event Routing   (Lines 7-14)    │
│   └── Message Activity Handler     (Lines 16-35)    │
│  Agent Application Export          (Line 38)        │
└─────────────────────────────────────────────────────┘
```

## 🔍 Core Components Deep Dive

### 1. MyAgent Class

**Location**: `src/agent.ts`, Lines 7-37

#### 1.1 Constructor and Event Routing (Lines 7-14)
```typescript
class MyAgent extends AgentApplication<TurnState> {
  constructor() {
    super();

    this.onActivity(ActivityTypes.Message, async (context: TurnContext, state: TurnState) => {
      await this.handleAgentMessageActivity(context, state);
    });
  }
```

**Key Features**:
- **Message Activity Routing**: Registers a single handler for message activities
- **Bot Framework Integration**: Extends `AgentApplication` with standard `TurnState`

#### 1.2 Message Activity Handler (Lines 16-35)
```typescript
/**
 * Handles incoming user messages and sends responses.
 */
async handleAgentMessageActivity(turnContext: TurnContext, state: TurnState): Promise<void> {
  const userMessage = turnContext.activity.text?.trim() || '';

  if (!userMessage) {
    await turnContext.sendActivity('Please send me a message and I\'ll help you!');
    return;
  }

  try {
    const client: Client = await getClient();
    const response = await client.invokeAgent(userMessage);
    await turnContext.sendActivity(response);
  } catch (error) {
    console.error('LLM query error:', error);
    const err = error as any;
    await turnContext.sendActivity(`Error: ${err.message || err}`);
  }
}
```

**Process Flow**:
1. **Input Validation**: Checks for non-empty user message
2. **Client Creation**: Gets a basic LangChain client
3. **Message Processing**: Passes user input directly to the agent
4. **Response**: Returns AI-generated response
5. **Error Handling**: Provides user-friendly error messages

## 🔧 Supporting Files

### 1. client.ts - Basic LangChain Integration

**Purpose**: Simple factory and wrapper for LangChain agents

**Key Components**:

#### A. Client Interface
```typescript
export interface Client {
  invokeAgent(prompt: string): Promise<string>;
}
```

#### B. getClient() Factory Function
```typescript
/**
 * Creates and configures a LangChain client.
 *
 * This factory function initializes a LangChain React agent.
 *
 * @returns Promise<Client> - Configured LangChain client ready for agent interactions
 *
 * @example
 * ```typescript
 * const client = await getClient();
 * const response = await client.invokeAgent("What can you help me with?");
 * ```
 */
export async function getClient(): Promise<Client> {
  // Create the model
  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
  });

  // Create the agent
  const agent = createAgent({
    model: model,
    tools: [],  // No MCP tools in this version
    name: 'My Custom Agent',
  });

  return new LangChainClient(agent);
}
```

#### C. LangChainClient Wrapper
```typescript
/**
 * LangChainClient provides an interface to interact with LangChain agents.
 */
class LangChainClient implements Client {
  private agent: ReactAgent;

  constructor(agent: ReactAgent) {
    this.agent = agent;
  }

  /**
   * Sends a user message to the LangChain agent and returns the AI's response.
   * Handles streaming results and error reporting.
   *
   * @param {string} userMessage - The message or prompt to send to the agent.
   * @returns {Promise<string>} The response from the agent, or an error message if the query fails.
   */
  async invokeAgent(userMessage: string): Promise<string> {
    const result = await this.agent.invoke({
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    let agentMessage: any = '';

    // Extract the content from the LangChain response
    if (result.messages && result.messages.length > 0) {
      const lastMessage = result.messages[result.messages.length - 1];
      agentMessage = lastMessage.content || "No content in response";
    }

    // Fallback if result is already a string
    if (typeof result === 'string') {
      agentMessage = result;
    }

    if (!agentMessage) {
      return "Sorry, I couldn't get a response from the agent :(";
    }

    return agentMessage;
  }
}
```

### 2. index.ts - Express Server

**Purpose**: Minimal HTTP server entry point with Bot Framework integration

**Full Code**:
```typescript
// It is important to load environment variables before importing other modules
import { configDotenv } from 'dotenv';

configDotenv();

import { AuthConfiguration, authorizeJWT, CloudAdapter, Request } from '@microsoft/agents-hosting';
import express, { Response } from 'express'
import { agentApplication } from './agent';

const authConfig: AuthConfiguration = {};

const server = express()
server.use(express.json())
server.use(authorizeJWT(authConfig))

server.post('/api/messages', (req: Request, res: Response) => {
  const adapter = agentApplication.adapter as CloudAdapter;
  adapter.process(req, res, async (context) => {
    await agentApplication.run(context)
  })
})

const port = process.env.PORT || 3978
server.listen(port, async () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
}).on('error', async (err) => {
  console.error(err);
  process.exit(1);
}).on('close', async () => {
  console.log('Server closed');
  process.exit(0);
});
```

**Features**:
- **Environment Loading**: Loads configuration from `.env` files using `dotenv`
- **Minimal Auth Config**: Empty `AuthConfiguration` object (no complex auth setup)
- **JWT Middleware**: Uses `authorizeJWT()` for basic authentication
- **Bot Framework**: CloudAdapter processes incoming Bot Framework messages
- **Single Endpoint**: `/api/messages` POST endpoint for message handling
- **Port Configuration**: Uses `PORT` environment variable or defaults to 3978

## 🎯 Design Patterns and Best Practices

### 1. Factory Pattern

**Implementation**:
- `getClient()` creates LangChain agents with minimal configuration
- Separation of concerns between agent logic and client creation
- Simple, stateless factory function

**Benefits**:
- Easy to test and modify
- Clean separation of LangChain specifics from agent code
- No complex dependency injection needed

### 2. Event-Driven Architecture

**Bot Framework Integration**:
```typescript
this.onActivity(ActivityTypes.Message, async (context, state) => {
  await this.handleAgentMessageActivity(context, state);
});
```

**Benefits**:
- Type-safe event routing
- Scalable message handling
- Clear separation of activity types

## 📊 Current Capabilities

This is a **minimal quickstart** implementation. Some features were intentionally excluded to keep the code simple:

### 1. Basic Conversational AI
- ✅ Handles user messages with LangChain React agent
- ✅ Generates AI responses using GPT-4o-mini
- ✅ Provides basic error feedback
- ❌ No external tools or API integration
- ❌ No conversation history tracking

### 2. Bot Framework Integration
- ✅ Works with Microsoft Bot Framework
- ✅ Supports standard messaging protocols
- ✅ Basic JWT authentication through Express middleware
- ❌ No agent notification processing
- ❌ No advanced activity type handling

### 3. Simple Express Server
- ✅ Single `/api/messages` endpoint
- ✅ Environment variable configuration
- ✅ Port configuration (default 3978)
- ❌ No telemetry or monitoring
- ❌ No custom middleware

## 🔗 Related Resources

- **Full Sample**: See `../sample-agent/` for complete implementation with all features
- **LangChain Docs**: https://js.langchain.com/docs/
- **Agent365 SDK**: https://aka.ms/Agent365SDK
- **Bot Framework**: https://dev.botframework.com/
- **Upgrade Your Agent**: https://review.learn.microsoft.com/en-us/microsoft-agent-365/developer/quickstart-nodejs-langchain?branch=main

---

**Summary**: This quickstart provides a minimal LangChain agent implementation through the Microsoft Bot Framework. It demonstrates the basic message flow and agent structure **without** MCP tools, observability, or notifications. This simplified version helps you understand the core concepts before adding advanced features. See the `sample-agent` directory for the complete implementation.