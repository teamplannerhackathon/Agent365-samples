# Agent Code Walkthrough

This document provides a detailed walkthrough of the code for this Azure AI Foundry agent. The agent is designed to perform specific tasks autonomously, interacting with the user as needed using Azure AI Foundry's persistent agent capabilities.

## Key Files in this Solution

### Program.cs
This is the entry point for the application. It sets up the necessary services and middleware for the agent, including:
- Configuring OpenTelemetry and A365 tracing for observability
- Registering the Azure AI Foundry `PersistentAgentsClient` for agent management
- Setting up MCP tool services for external tool integration
- Configuring ASP.NET Core authentication and authorization
- Registering storage (MemoryStorage for development)
- Defining the HTTP endpoint for processing messages

### Agent/MyAgent.cs
This file contains the implementation of the agent's core logic, including how it registers handling of activities. The constructor registers three key handlers:
1. **Notification Handler**: Handles notifications from Microsoft 365 apps (email mentions, Word/Excel comments)
2. **Installation Update Handler**: Handles agent installation ("hire") and uninstallation ("offboard") events
3. **Message Handler**: Handles messages from both agentic channels (Microsoft 365 Agents) and non-agentic channels (Teams, Web Chat)

When the agent receives an activity, the relevant handler is invoked to process it.

### Plugins (Terms & Conditions)
The sample includes a terms and conditions plugin that demonstrates how to:
- Implement custom business logic before agent processing
- Control agent behavior based on user consent
- Integrate with the Agent 365 framework's plugin architecture

### telemetry/AgentMetrics.cs and telemetry/AgentOTELExtensions.cs
These files provide observability infrastructure:
- **AgentMetrics.cs**: Defines metrics and telemetry constants, provides helper methods for tracking operations
- **AgentOTELExtensions.cs**: Contains extension methods for OpenTelemetry configuration (service discovery, HTTP resilience, OTLP exporters, runtime instrumentation)

## Activities Handled by the Agent

### InstallationUpdate Activity
Triggered when the agent is installed ("hired") or uninstalled ("offboarded") by a user.

**On Installation:**
- Sets `IsApplicationInstalled = true`
- Sets `TermsAndConditionsAccepted` based on whether it's an agentic request
- Sends a welcome message to the user

**On Uninstallation:**
- Sets `IsApplicationInstalled = false`
- Resets `TermsAndConditionsAccepted = false`
- Sends a goodbye message to the user

### Notification Activity
Handles notifications from Microsoft 365 applications, such as:
- Email mentions of the agent
- @mentions in Word document comments
- @mentions in Excel comments

The agent processes these notifications and responds appropriately based on the context and content.

### Message Activity
Handles direct messages sent to the agent from:
- Agentic channels (Microsoft 365 Agents) - uses `AgenticIdAuthHandler` for authentication
- Non-agentic channels (Teams, Web Chat, etc.) - uses custom authentication handlers

When a message is received:
1. The agent creates or retrieves an Azure AI Foundry agent
2. Configures MCP tools on the agent for external integrations
3. Creates a conversation thread
4. Executes the agent run with tool support
5. Returns the response to the user

## Related Documentation

For detailed information about the Agent 365 activity protocol and samples of different activity types, see:
                    "Thank you for your time!"), 
                    cancellationToken);
            }
        });
}
```

> **Note:** The `TermsAndConditionsAccepted` flag has been implemented as a static property in the `MyAgent` class for simplicity. In a production scenario, this should be stored in a persistent storage solution. It is only intended as a simple example to demonstrate the InstallationUpdate activity.

### Notification Activity

This activity is triggered when the agent receives a notification, such as:
- When the user mentions the agent in a Word document comment
- When the agent receives an email mention

The `AgentNotificationActivityAsync` method in `MyAgent.cs` handles this activity:

**Email Notification Handling:**
```csharp
case NotificationTypeEnum.EmailNotification:
    if (notification.EmailNotification == null)
    {
        var responseActivity = EmailResponse.CreateEmailResponseActivity(
            "I could not find the email notification details.");
        await turnContext.SendActivityAsync(responseActivity, cancellationToken);
        return;
    }

    // Create agent and process email
    var agent = await GetOrCreateAgentAsync(authHandlerName, turnContext);
    var thread = _agentClient.Threads.CreateThread();
    
    var emailContent = $"You have a new email from {notification.From.Name} with id '{notification.EmailNotification.Id}'. Please retrieve and process this message.";
    
    _agentClient.Messages.CreateMessage(thread.Id, MessageRole.User, emailContent);
    var run = _agentClient.Runs.CreateRun(thread, agent);
    
    await ExecuteAndDisplayRunAsync(_agentClient, run, thread, turnContext, cancellationToken);
    
    _agentClient.Threads.DeleteThread(thread.Id);
    break;
```

**Word Comment Notification Handling:**
```csharp
case NotificationTypeEnum.WpxComment:
    // Similar pattern for Word document comments
    var commentText = $"You have a new comment on a Word document. Comment: {notification.Text}";
    // Create thread, execute run, display results
    break;
```

### Message Activity

This activity is triggered when the agent receives a message from the user through:
- Teams chat
- Web Chat
- Microsoft 365 Agents Playground
- Other supported channels

The `MessageActivityAsync` method in `MyAgent.cs` handles this activity:

**Implementation Flow:**
1. **Setup Authentication:** Determines the appropriate auth handler (agentic vs. non-agentic)
2. **Wrap with Observability:** Uses `A365OtelWrapper` to track the operation
3. **Queue Progress Indicator:** Shows "Processing your message..." to the user
4. **Create/Get Agent:** Creates or retrieves the Azure AI Foundry agent with MCP tools
5. **Create Thread:** Establishes a conversation thread
6. **Add Message:** Adds the user's message to the thread
7. **Execute Run:** Runs the agent to process the message
8. **Display Results:** Streams the response back to the user
9. **Cleanup:** Deletes the thread resources

```csharp
protected async Task MessageActivityAsync(ITurnContext turnContext, ITurnState turnState, CancellationToken cancellationToken)
{
    string observabilityAuthHandlerName = turnContext.IsAgenticRequest() ? AgenticIdAuthHandler : MyAuthHandler;
    string toolAuthHandlerName = observabilityAuthHandlerName;

    await A365OtelWrapper.InvokeObservedAgentOperation(
        "MessageProcessor",
        turnContext,
        turnState,
        _agentTokenCache,
        UserAuthorization,
        observabilityAuthHandlerName,
        _logger,
        async () =>
        {
            await turnContext.StreamingResponse.QueueInformativeUpdateAsync(
                "Processing your message...", cancellationToken);

            try
            {
                var userText = turnContext.Activity.Text?.Trim() ?? string.Empty;
                
                // Create or get agent with MCP tools
                var agent = await GetOrCreateAgentAsync(toolAuthHandlerName, turnContext);
                
                // Create thread for communication
                PersistentAgentThread thread = _agentClient.Threads.CreateThread();

                // Create message to thread
                PersistentThreadMessage message = _agentClient.Messages.CreateMessage(
                    thread.Id,
                    MessageRole.User,
                    userText);

                // Execute run
                ThreadRun run = _agentClient.Runs.CreateRun(thread, agent);

                // Wait for completion and display results
                await ExecuteAndDisplayRunAsync(_agentClient, run, thread, turnContext, cancellationToken);

                // Clean up resources
                _agentClient.Threads.DeleteThread(thread.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error processing message: {ex.Message}");
                await turnContext.SendActivityAsync(
                    $"Sorry, I encountered an error: {ex.Message}", 
                    cancellationToken: cancellationToken);
            }
            finally
            {
                await turnContext.StreamingResponse.EndStreamAsync(cancellationToken);
            }
        });
}
```

## MCP Tool Integration

### ToolingManifest.json
Defines the MCP servers to be loaded:

```json
{
  "mcpServers": [
    {
      "mcpServerName": "mcp_MailTools"
    },
    {
      "mcpServerName": "mcp_CalendarTools"
    }
  ]
}
```

### Tool Registration
The `IMcpToolRegistrationService` is used to register MCP tools with the Azure AI Foundry agent:

```csharp
await _toolsService.AddToolServersToAgentAsync(
    _agentClient,
    agent.Id,
    UserAuthorization,
    authHandlerName,
    turnContext);
```

This automatically:
1. Reads the `ToolingManifest.json` file
2. Connects to each MCP server
3. Retrieves tool definitions
4. Registers them with the Azure AI Foundry agent

## Observability and Telemetry

### Tracing Configuration
The agent uses OpenTelemetry for comprehensive tracing:

```csharp
builder.AddA365Tracing(config =>
{
    config.WithAzureAIFoundry();
});
```

### Observed Operations
Key operations are wrapped with observability:

```csharp
await A365OtelWrapper.InvokeObservedAgentOperation(
    "MessageProcessor",          // Operation name
    turnContext,                 // Turn context
    turnState,                   // Turn state
    _agentTokenCache,           // Token cache
    UserAuthorization,          // Authorization
    authHandlerName,            // Auth handler
    _logger,                    // Logger
    async () => { /* operation */ }
);
```

This provides:
- Distributed tracing spans
- Token caching and management
- Error tracking
- Performance metrics

### Metrics Tracking
HTTP operations are tracked with metrics:

```csharp
await AgentMetrics.InvokeObservedHttpOperation("agent.process_message", async () =>
{
    await adapter.ProcessAsync(request, response, agent, cancellationToken);
});
```

## Authentication Patterns

The agent supports two authentication modes:

### Agentic Authentication
Used for requests from Microsoft 365 Agents:
- Handler name: `"agentic"`
- Uses federated credentials
- Automatic token management via Agent 365 SDK

### User Authentication
Used for direct user interactions (Teams, Web Chat):
- Handler name: `"me"`
- Uses standard authentication flows
- Manual token handling

**Selection Logic:**
```csharp
string authHandler = turnContext.IsAgenticRequest() ? AgenticIdAuthHandler : MyAuthHandler;
```

## Configuration

### appsettings.json Structure
```json
{
  "AzureAIFoundry": {
    "ProjectEndpoint": "<<YOUR_PROJECT_ENDPOINT>>",
    "ModelDeploymentName": "<<YOUR_MODEL_DEPLOYMENT_NAME>>"
  },
  "AgentApplication": {
    "AppId": "<<YOUR_APP_ID>>"
  },
  "TokenValidation": {
    "RequireHttpsMetadata": false,
    "ValidIssuers": [ /* ... */ ],
    "ValidAudiences": [ /* ... */ ]
  },
  "AzureAd": {
    "TenantId": "<<YOUR_TENANT_ID>>",
    "ClientId": "<<YOUR_CLIENT_ID>>",
    "ClientSecret": "<<YOUR_CLIENT_SECRET>>"
  }
}
```

## Error Handling

The agent implements comprehensive error handling:

### Try-Catch Blocks
All major operations are wrapped in try-catch:
```csharp
try
{
    // Operation
}
catch (Exception ex)
{
    _logger.LogError($"Error: {ex.Message}");
    await turnContext.SendActivityAsync($"Sorry, I encountered an error: {ex.Message}");
}
finally
{
    await turnContext.StreamingResponse.EndStreamAsync(cancellationToken);
}
```

### Graceful Degradation
- If MCP tools fail to load, the agent continues without them
- If a notification cannot be processed, a friendly error message is sent
- All errors are logged for diagnostics

## Run Execution and Display

### ExecuteAndDisplayRunAsync Method
Handles the agent run execution and result streaming:

```csharp
private async Task ExecuteAndDisplayRunAsync(
    PersistentAgentsClient agentClient, 
    ThreadRun run, 
    PersistentAgentThread thread,
    ITurnContext turnContext,
    CancellationToken cancellationToken)
{
    // Poll for completion
    while (run.Status != RunStatus.Completed &&
           run.Status != RunStatus.Failed &&
           run.Status != RunStatus.Cancelled &&
           run.Status != RunStatus.Expired)
    {
        await Task.Delay(1000, cancellationToken);
        run = agentClient.Runs.GetRun(thread.Id, run.Id);
    }

    // Display results
    if (run.Status == RunStatus.Completed)
    {
        var messages = agentClient.Messages.GetMessages(
            threadId: thread.Id, 
            order: ListSortOrder.Descending);
        
        foreach (PersistentThreadMessage message in messages)
        {
            if (message.Role == "assistant")
            {
                foreach (MessageContent contentItem in message.ContentItems)
                {
                    if (contentItem is MessageTextContent textItem)
                    {
                        turnContext.StreamingResponse.QueueTextChunk(textItem.Text);
                    }
                }
            }
        }
    }
}
```

## Activity Protocol Samples

For more information on the activity protocol and sample payloads, please refer to the [Activity Protocol Samples](https://learn.microsoft.com/microsoft-agent-365/developer/activity-protocol).

## Best Practices Demonstrated

1. **Separation of Concerns**: Clear separation between hosting, business logic, and infrastructure
2. **Dependency Injection**: Proper use of DI for testability and maintainability
3. **Async/Await**: Consistent use of async patterns throughout
4. **Error Handling**: Comprehensive error handling with user-friendly messages
5. **Observability**: End-to-end tracing and metrics collection
6. **Security**: Proper authentication and authorization patterns
7. **Resource Management**: Proper cleanup of threads and other resources
8. **Configuration**: External configuration with validation
9. **Logging**: Structured logging throughout the application
10. **Scalability**: Stateless design suitable for horizontal scaling

## Next Steps

To learn more about implementing specific features:
- **Observability**: See `telemetry/` folder files
- **Tool Integration**: See `IMcpToolRegistrationService` usage
- **Notifications**: See notification handler implementations
- **Authentication**: Review auth handler patterns in `MyAgent.cs`

For complete setup and running instructions, see [HOW_TO_RUN.md](HOW_TO_RUN.md).
