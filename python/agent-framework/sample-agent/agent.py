# Copyright (c) Microsoft. All rights reserved.

"""
AgentFramework Agent with MCP Server Integration and Observability

This agent uses the AgentFramework SDK and connects to MCP servers for extended functionality,
with integrated observability using Microsoft Agent 365.

Features:
- AgentFramework SDK with Azure OpenAI integration
- MCP server integration for dynamic tool registration
- Simplified observability setup
- Automatic AgentFramework instrumentation
- Custom spans with detailed attributes
- Comprehensive error handling and cleanup
"""

import asyncio
import logging
import os

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# DEPENDENCY IMPORTS
# =============================================================================
# <DependencyImports>

# AgentFramework SDK
from agent_framework.azure import AzureOpenAIChatClient
from agent_framework import ChatAgent
from azure.identity import AzureCliCredential

# Agent Interface
from agent_interface import AgentInterface

# Microsoft Agents SDK
from local_authentication_options import LocalAuthenticationOptions
from microsoft_agents.hosting.core import Authorization, TurnContext

# Observability Components
from microsoft_agents_a365.observability.core.config import configure

# AgentFramework Instrumentation (when available)
# from microsoft_agents_a365.observability.agentframework import InstrumentorAgentFramework

# MCP Tooling
from microsoft_agents_a365.tooling.extensions.agentframework.services.mcp_tool_registration_service import (
    McpToolRegistrationService,
)

# </DependencyImports>


class AgentFrameworkAgent(AgentInterface):
    """AgentFramework Agent integrated with MCP servers and Observability"""

    # =========================================================================
    # INITIALIZATION
    # =========================================================================
    # <Initialization>

    def __init__(self):
        """Initialize the AgentFramework agent."""
        self.logger = logging.getLogger(self.__class__.__name__)

        # Initialize observability
        self._setup_observability()

        # Initialize authentication options
        self.auth_options = LocalAuthenticationOptions.from_environment()

        # Create Azure OpenAI chat client
        self._create_chat_client()

        # Create the agent with initial configuration
        self._create_agent()

        # Initialize MCP services
        self._initialize_services()

    # </Initialization>

    # =========================================================================
    # CLIENT AND AGENT CREATION
    # =========================================================================
    # <ClientCreation>

    def _create_chat_client(self):
        """Create the Azure OpenAI chat client"""
        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        api_version = os.getenv("AZURE_OPENAI_API_VERSION")

        if not endpoint:
            raise ValueError("AZURE_OPENAI_ENDPOINT environment variable is required")
        if not deployment:
            raise ValueError("AZURE_OPENAI_DEPLOYMENT environment variable is required")
        if not api_version:
            raise ValueError(
                "AZURE_OPENAI_API_VERSION environment variable is required"
            )

        logger.info(f"Creating AzureOpenAIChatClient with endpoint: {endpoint}")
        logger.info(f"Deployment: {deployment}")
        logger.info(f"API Version: {api_version}")

        self.chat_client = AzureOpenAIChatClient(
            endpoint=endpoint,
            credential=AzureCliCredential(),
            deployment_name=deployment,
            api_version=api_version,
        )

        logger.info("✅ AzureOpenAIChatClient created successfully")

    def _create_agent(self):
        """Create the AgentFramework agent with initial configuration"""
        try:
            logger.info("Creating AgentFramework agent...")

            self.agent = ChatAgent(
                chat_client=self.chat_client,
                instructions="You are a helpful assistant with access to tools.",
                #tools=[],  # Tools will be added dynamically by MCP setup
            )

            logger.info("✅ AgentFramework agent created successfully")

        except Exception as e:
            logger.error(f"Failed to create agent: {e}")
            raise

    # </ClientCreation>

    # =========================================================================
    # OBSERVABILITY CONFIGURATION
    # =========================================================================
    # <ObservabilityConfiguration>

    def _setup_observability(self):
        """
        Configure Microsoft Agent 365 observability
        
        Default: Console logging (ConsoleSpanExporter) for development
        - Set ENABLE_KAIRO_EXPORTER=false or ENABLE_A365_OBSERVABILITY_EXPORTER=false
        
        Advanced: Cloud export to Agent365 for production
        - Set ENABLE_KAIRO_EXPORTER=true (or ENABLE_A365_OBSERVABILITY_EXPORTER=true)
        - Provide token_resolver in configure()
        - Add framework instrumentation:
          * AgentFramework: InstrumentorAgentFramework().instrument()
        """
        try:
            os.environ["ENABLE_OBSERVABILITY"] = "true"
            
            # Check both legacy (ENABLE_KAIRO_EXPORTER) and new (ENABLE_A365_OBSERVABILITY_EXPORTER) keys
            use_cloud_export = (
                os.getenv("ENABLE_KAIRO_EXPORTER", "false").lower() == "true" or
                os.getenv("ENABLE_A365_OBSERVABILITY_EXPORTER", "false").lower() == "true"
            )
            
            if use_cloud_export:
                logger.warning("⚠️ Cloud export requires token_resolver - implement when needed")
                # TODO: For cloud export, implement token_resolver:
                # status = configure(
                #     service_name=os.getenv("OBSERVABILITY_SERVICE_NAME", "agentframework-sample-agent"),
                #     service_namespace=os.getenv("OBSERVABILITY_SERVICE_NAMESPACE", "agent365-samples"),
                #     token_resolver=self.token_resolver,
                #     cluster_category=os.getenv("CLUSTER_CATEGORY", "preprod"),
                # )
                return
            else:
                logger.info("🖥️  Configuring observability with console output")
                status = configure(
                    service_name=os.getenv("OBSERVABILITY_SERVICE_NAME", "agentframework-sample-agent"),
                    service_namespace=os.getenv("OBSERVABILITY_SERVICE_NAMESPACE", "agent365-samples"),
                )

            if not status:
                logger.warning("⚠️ Observability configuration failed")
                return

            export_type = "cloud (Agent365)" if use_cloud_export else "console"
            logger.info(f"✅ Observability configured with {export_type} output")

            self._enable_agentframework_instrumentation()

        except Exception as e:
            logger.error(f"❌ Error setting up observability: {e}")

    def _enable_agentframework_instrumentation(self):
        """
        Enable AgentFramework instrumentation for automatic tracing
        
        To enable: Uncomment the import and call below when package is available
        from microsoft_agents_a365.observability.agentframework import InstrumentorAgentFramework
        InstrumentorAgentFramework().instrument()
        """
        try:
            # TODO: Uncomment when InstrumentorAgentFramework is available
            # InstrumentorAgentFramework().instrument()
            
            logger.info("ℹ️  AgentFramework instrumentation ready (enable InstrumentorAgentFramework for detailed traces)")
        except Exception as e:
            logger.warning(f"⚠️ Could not enable AgentFramework instrumentation: {e}")

    # </ObservabilityConfiguration>

    # =========================================================================
    # MCP SERVER SETUP AND INITIALIZATION
    # =========================================================================
    # <McpServerSetup>

    def _initialize_services(self):
        """Initialize MCP services and authentication options"""
        try:
            # Create MCP tool registration service
            self.tool_service = McpToolRegistrationService()
            logger.info("✅ AgentFramework MCP tool registration service initialized")
        except Exception as e:
            logger.warning(f"⚠️ Could not initialize MCP tool service: {e}")
            self.tool_service = None

    async def setup_mcp_servers(self, auth: Authorization, context: TurnContext):
        """Set up MCP server connections"""
        try:
            if not self.tool_service:
                logger.warning(
                    "⚠️ MCP tool service not available - skipping MCP server setup"
                )
                return

            logger.info("🔍 Starting MCP server setup...")

            agent_user_id = os.getenv("AGENT_ID", "user123")
            use_agentic_auth = os.getenv("USE_AGENTIC_AUTH", "false").lower() == "true"

            logger.info(f"🆔 Agent User ID: {agent_user_id}")
            logger.info(f"🔐 Using agentic auth: {use_agentic_auth}")

            if use_agentic_auth:
                logger.info("🔄 Adding tool servers with agentic authentication...")
                self.agent = await self.tool_service.add_tool_servers_to_agent(
                    chat_client=self.chat_client,
                    agent_instructions="You are a helpful assistant with access to tools.",
                    initial_tools=[],
                    agent_user_id=agent_user_id,
                    environment_id=self.auth_options.env_id,
                    auth=auth,
                    turn_context=context,
                )
            else:
                logger.info(
                    "🔄 Adding tool servers with bearer token authentication..."
                )
                self.agent = await self.tool_service.add_tool_servers_to_agent(
                    chat_client=self.chat_client,
                    agent_instructions="You are a helpful assistant with access to tools.",
                    initial_tools=[],
                    agent_user_id=agent_user_id,
                    environment_id=self.auth_options.env_id,
                    auth=auth,
                    auth_token=self.auth_options.bearer_token,
                    turn_context=context,
                )

            if self.agent:
                logger.info("✅ Agent MCP setup completed successfully")
            else:
                logger.error("❌ Agent is None after MCP setup")

        except Exception as e:
            logger.error(f"Error setting up MCP servers: {e}")
            logger.exception("Full error details:")

    # </McpServerSetup>

    # =========================================================================
    # INITIALIZATION AND MESSAGE PROCESSING
    # =========================================================================
    # <MessageProcessing>

    async def initialize(self):
        """Initialize the agent and MCP server connections"""
        logger.info("Initializing AgentFramework Agent with MCP servers...")
        try:
            logger.info("Agent initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize agent: {e}")
            raise

    async def process_user_message(
        self, message: str, auth: Authorization, context: TurnContext
    ) -> str:
        """Process user message using the AgentFramework SDK"""
        try:
            # Setup MCP servers
            await self.setup_mcp_servers(auth, context)

            # Run the agent with the user message
            result = await self.agent.run(message)

            # Extract the response from the result
            if result:
                if hasattr(result, "contents"):
                    return str(result.contents)
                elif hasattr(result, "text"):
                    return str(result.text)
                elif hasattr(result, "content"):
                    return str(result.content)
                else:
                    return str(result)
            else:
                return "I couldn't process your request at this time."

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            return f"Sorry, I encountered an error: {str(e)}"

    # </MessageProcessing>

    # =========================================================================
    # CLEANUP
    # =========================================================================
    # <Cleanup>

    async def cleanup(self) -> None:
        """Clean up agent resources and MCP server connections"""
        try:
            logger.info("Cleaning up agent resources...")

            # Cleanup MCP tool service if it exists
            if hasattr(self, "tool_service") and self.tool_service:
                try:
                    await self.tool_service.cleanup()
                    logger.info("MCP tool service cleanup completed")
                except Exception as cleanup_ex:
                    logger.warning(f"Error cleaning up MCP tool service: {cleanup_ex}")

            logger.info("Agent cleanup completed")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

    # </Cleanup>


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================
# <MainEntryPoint>


async def main():
    """Main function to run the AgentFramework Agent with MCP servers"""
    try:
        # Create and initialize the agent
        agent = AgentFrameworkAgent()
        await agent.initialize()

    except Exception as e:
        logger.error(f"Failed to start agent: {e}")
        print(f"Error: {e}")

    finally:
        # Cleanup
        if "agent" in locals():
            await agent.cleanup()


if __name__ == "__main__":
    asyncio.run(main())

# </MainEntryPoint>
