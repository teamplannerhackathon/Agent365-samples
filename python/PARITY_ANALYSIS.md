# Code Parity Analysis: Agent Framework vs Claude Agent SDK

**Date:** November 10, 2025  
**Analyzed Projects:**
- `python/agent-framework/sample-agent/` 
- `python/claude/sample-agent/`

---

## Executive Summary

Both sample agents follow the same architectural pattern with a generic host design, but differ significantly in their AI backend implementation and feature completeness. The Claude agent is **missing several critical features** present in the agent-framework sample.

### Quick Stats

| Aspect | Agent Framework | Claude Agent | Status |
|--------|----------------|--------------|--------|
| **Core Files** | 8 | 9 | ✅ Equal |
| **AI Backend** | AgentFramework SDK + Azure OpenAI | Claude Agent SDK | ⚠️ Different |
| **MCP Support** | ✅ Full | ❌ Missing | ❌ Gap |
| **Notification Handling** | ✅ Full (Email, Word) | ❌ Missing | ❌ Gap |
| **Observability** | ✅ Auto-instrumentation | ⚠️ Manual only | ⚠️ Gap |
| **Observability Helpers** | ❌ Missing | ✅ Present | ℹ️ Different approach |

---

## 1. File Structure Comparison

### Agent Framework Files
```
agent-framework/sample-agent/
├── agent_interface.py          ✅ Shared base class
├── agent.py                    🔵 AgentFramework implementation
├── host_agent_server.py        ✅ Generic host (with notifications)
├── local_authentication_options.py  ✅ Auth config
├── token_cache.py              ✅ Token caching
├── start_with_generic_host.py  ✅ Entry point
├── pyproject.toml              🔵 AgentFramework dependencies
├── .env.template               ✅ Environment config
├── README.md                   ✅ Documentation
└── ToolingManifest.json        ✅ Manifest
```

### Claude Agent Files
```
claude/sample-agent/
├── agent_interface.py          ✅ Shared base class (identical)
├── agent.py                    🟢 Claude SDK implementation
├── host_agent_server.py        ⚠️ Generic host (NO notifications)
├── local_authentication_options.py  ⚠️ Simplified version
├── token_cache.py              ✅ Token caching (with clear function)
├── observability_helpers.py    ➕ Helper utilities (NEW)
├── start_with_generic_host.py  ✅ Entry point
├── pyproject.toml              🟢 Claude SDK dependencies
├── .env.template               ✅ Environment config (updated)
├── .env                        ✅ Actual config file (NEW)
└── ToolingManifest.json        ✅ Manifest
```

**Legend:**  
- ✅ Present and similar
- ⚠️ Present but different/missing features
- 🔵 Framework-specific
- 🟢 Claude-specific
- ➕ Additional file
- ❌ Missing

---

## 2. Detailed File-by-File Analysis

### 2.1 `agent_interface.py`

| Aspect | Agent Framework | Claude Agent | Parity |
|--------|----------------|--------------|--------|
| Base class definition | ✅ `AgentInterface(ABC)` | ✅ `AgentInterface(ABC)` | ✅ **100%** |
| Methods | `initialize()`, `process_user_message()`, `cleanup()` | Same | ✅ **100%** |
| Inheritance check | ✅ Returns bool | ✅ Returns bool + prints | ⚠️ **95%** (minor diff) |
| Line count | ~55 | ~58 | ✅ Nearly identical |

**Differences:**
- Claude version adds a success message print in `check_agent_inheritance()`
- This is cosmetic only

**Recommendation:** ✅ **No action needed** - Functionally identical

---

### 2.2 `agent.py` - The Core Agent Logic

This is where the most significant differences exist.

#### Architecture Comparison

| Component | Agent Framework | Claude Agent | Parity |
|-----------|----------------|--------------|--------|
| **AI Backend** | AgentFramework SDK + Azure OpenAI | Claude Agent SDK | Different |
| **Initialization** | Chat client + MCP services | Claude options only | Different |
| **Conversation State** | Managed by framework | Per-conversation client | Different |
| **Tool Support** | MCP servers (dynamic) | Built-in tools (Read, Write, WebSearch, WebFetch) | Different |
| **Thinking Support** | ❌ No | ✅ Extended thinking (1024 tokens) | Claude feature |
| **Auto-instrumentation** | ✅ `AgentFrameworkInstrumentor` | ❌ No | **Missing** |
| **MCP Integration** | ✅ Full `McpToolRegistrationService` | ❌ None | **Missing** |
| **Notification Handling** | ✅ Email + Word comments | ❌ None | **Missing** |
| **Manual Observability** | Basic | ✅ Detailed scopes with helpers | Different approach |

#### Key Missing Features in Claude Agent

##### 1. **MCP (Model Context Protocol) Support** ❌

**Agent Framework has:**
```python
from microsoft_agents_a365.tooling.extensions.agentframework.services.mcp_tool_registration_service import (
    McpToolRegistrationService,
)

def _initialize_services(self):
    """Initialize MCP services"""
    try:
        self.tool_service = McpToolRegistrationService()
        logger.info("✅ MCP tool service initialized")

async def setup_mcp_servers(self, auth: Authorization, context: TurnContext):
    """Set up MCP server connections"""
    self.agent = await self.tool_service.add_tool_servers_to_agent(...)
```

**Claude Agent has:** Nothing - uses only built-in Claude tools

**Impact:** 🔴 **HIGH** - Cannot integrate with Agent365 MCP servers for Mail, Calendar, SharePoint, etc.

**Recommendation:** 
```python
# TODO: Add MCP support to Claude agent
# 1. Import McpToolRegistrationService
# 2. Add _initialize_services() method
# 3. Add setup_mcp_servers() async method
# 4. Call during first message processing
```

---

##### 2. **Notification Handling** ❌

**Agent Framework has:**
```python
async def handle_agent_notification_activity(
    self, notification_activity, auth: Authorization, context: TurnContext
) -> str:
    """Handle agent notification activities (email, Word mentions, etc.)"""
    notification_type = notification_activity.notification_type
    
    # Handle Email Notifications
    if notification_type == NotificationTypes.EMAIL_NOTIFICATION:
        email = notification_activity.email
        email_body = getattr(email, "html_body", "") or getattr(email, "body", "")
        message = f"You have received the following email..."
        result = await self.agent.run(message)
        
    # Handle Word Comment Notifications
    elif notification_type == NotificationTypes.WPX_COMMENT:
        wpx = notification_activity.wpx_comment
        doc_id = getattr(wpx, "document_id", "")
        # Retrieve Word doc and process comment
```

**Claude Agent has:** Nothing

**Impact:** 🔴 **HIGH** - Cannot respond to @mentions in emails or Word documents

**Recommendation:**
```python
# TODO: Add notification handling to Claude agent
# 1. Import AgentNotification, NotificationTypes
# 2. Add handle_agent_notification_activity() method
# 3. Process EMAIL_NOTIFICATION
# 4. Process WPX_COMMENT
# 5. Test with Agent365 playground notifications
```

---

##### 3. **Auto-Instrumentation for Observability** ❌

**Agent Framework has:**
```python
from microsoft_agents_a365.observability.extensions.agentframework.trace_instrumentor import (
    AgentFrameworkInstrumentor,
)

def _enable_agentframework_instrumentation(self):
    """Enable AgentFramework instrumentation"""
    try:
        AgentFrameworkInstrumentor().instrument()
        logger.info("✅ Instrumentation enabled")
```

**Claude Agent has:** Manual observability scopes only

**Impact:** 🟡 **MEDIUM** - Less automatic tracing, more manual work

**Note:** Claude agent compensates with `observability_helpers.py` for manual scope creation

**Recommendation:**
```python
# OPTIONAL: Claude doesn't have auto-instrumentation (no Claude-specific instrumentor exists)
# Current manual approach with observability_helpers is acceptable
# Could explore creating ClaudeInstrumentor if needed
```

---

##### 4. **Token Resolver for Observability** ⚠️

**Agent Framework has:**
```python
def token_resolver(self, agent_id: str, tenant_id: str) -> str | None:
    """Token resolver for Agent 365 Observability"""
    try:
        cached_token = get_cached_agentic_token(tenant_id, agent_id)
        if not cached_token:
            logger.warning(f"No cached token for agent {agent_id}")
        return cached_token
```

**Claude Agent has:** Token resolver in `host_agent_server.py`, not in agent class

**Impact:** 🟢 **LOW** - Different location, same functionality

**Recommendation:** ✅ **No action needed** - Works fine in host

---

#### Unique Features in Claude Agent ✅

##### 1. **Observability Helpers Module** ✅

**Claude has:**
```python
# observability_helpers.py
def create_agent_details(context: Optional[TurnContext]) -> AgentDetails
def create_tenant_details(context: Optional[TurnContext]) -> TenantDetails
def create_request_details(user_message: str, ...) -> Request
def create_inference_details(model: str, tokens: int, ...) -> InferenceCallDetails
def create_tool_call_details(tool_name: str, ...) -> ToolCallDetails
```

This is a **better practice** for reusable observability code.

**Recommendation for Agent Framework:**
```python
# TODO: Extract observability object creation to shared helpers
# Similar to claude/observability_helpers.py
```

##### 2. **Extended Thinking Support** ✅

**Claude has:**
```python
self.claude_options = ClaudeAgentOptions(
    model=model,
    max_thinking_tokens=1024,  # Extended thinking
    allowed_tools=["WebSearch", "Read", "Write", "WebFetch"],
    permission_mode="acceptEdits",
    continue_conversation=True
)

# Process thinking blocks
if isinstance(block, ThinkingBlock):
    thinking_parts.append(f"💭 {block.thinking}")
```

This provides transparency into Claude's reasoning process.

**Impact:** ✅ **Positive** - Unique Claude feature, not applicable to other frameworks

---

### 2.3 `host_agent_server.py` - Generic Host

| Feature | Agent Framework | Claude Agent | Parity |
|---------|----------------|--------------|--------|
| **Base structure** | ✅ GenericAgentHost class | ✅ GenericAgentHost class | ✅ 100% |
| **Message handling** | ✅ @activity decorator | ✅ @activity decorator | ✅ 100% |
| **Help handler** | ✅ /help + membersAdded | ✅ /help + membersAdded | ✅ 100% |
| **Notification handler** | ✅ `@on_agent_notification` | ❌ **MISSING** | ❌ 0% |
| **Observability setup** | ✅ Token caching in handler | ⚠️ Only in create_and_run_host | ⚠️ 70% |
| **Baggage context** | ✅ In message handler | ❌ **MISSING** | ❌ 0% |
| **Auth modes** | ✅ Agentic + anonymous | ✅ Agentic + anonymous | ✅ 100% |
| **Health endpoint** | ✅ Yes | ✅ Yes | ✅ 100% |
| **Port fallback** | ✅ Yes | ✅ Yes | ✅ 100% |

#### Critical Missing Code in Claude's `host_agent_server.py`

##### 1. **Notification Handler Registration** ❌

**Agent Framework has:**
```python
from microsoft_agents_a365.notifications.agent_notification import (
    AgentNotification,
    AgentNotificationActivity,
    ChannelId,
)

self.agent_notification = AgentNotification(self.agent_app)

@self.agent_notification.on_agent_notification(
    channel_id=ChannelId(channel="agents", sub_channel="*"),
    auth_handlers=handler,
)
async def on_notification(
    context: TurnContext,
    state: TurnState,
    notification_activity: AgentNotificationActivity,
):
    # Process notifications
    response = await self.agent_instance.handle_agent_notification_activity(
        notification_activity, self.agent_app.auth, context
    )
```

**Claude Agent has:** Nothing

**Impact:** 🔴 **CRITICAL** - Cannot receive notifications from Agent365

**Recommendation:**
```python
# TODO: Add to Claude's host_agent_server.py __init__:
from microsoft_agents_a365.notifications.agent_notification import (
    AgentNotification,
    AgentNotificationActivity, 
    ChannelId,
)

self.agent_notification = AgentNotification(self.agent_app)

# TODO: Add notification handler in _setup_handlers()
# See agent-framework version for reference
```

---

##### 2. **Baggage Context for Observability** ❌

**Agent Framework has:**
```python
from microsoft_agents_a365.observability.core.middleware.baggage_builder import (
    BaggageBuilder,
)

async def on_message(context: TurnContext, _: TurnState):
    result = await self._validate_agent_and_setup_context(context)
    tenant_id, agent_id = result
    
    with BaggageBuilder().tenant_id(tenant_id).agent_id(agent_id).build():
        # Process message with baggage context
        response = await self.agent_instance.process_user_message(...)
```

**Claude Agent has:** Nothing

**Impact:** 🟡 **MEDIUM** - Missing distributed tracing context propagation

**Recommendation:**
```python
# TODO: Add baggage context to Claude's message handler
from microsoft_agents_a365.observability.core.middleware.baggage_builder import BaggageBuilder

# Wrap message processing:
with BaggageBuilder().tenant_id(tenant_id).agent_id(agent_id).build():
    response = await self.agent_instance.process_user_message(...)
```

---

##### 3. **Token Cache Setup** ⚠️

**Agent Framework has:**
```python
async def _setup_observability_token(
    self, context: TurnContext, tenant_id: str, agent_id: str
):
    try:
        exaau_token = await self.agent_app.auth.exchange_token(
            context,
            scopes=get_observability_authentication_scope(),
            auth_handler_id="AGENTIC",
        )
        cache_agentic_token(tenant_id, agent_id, exaau_token.token)

async def _validate_agent_and_setup_context(self, context: TurnContext):
    tenant_id = context.activity.recipient.tenant_id
    agent_id = context.activity.recipient.agentic_app_id
    await self._setup_observability_token(context, tenant_id, agent_id)
```

**Claude Agent has:** Token setup only in `create_and_run_host()` function

**Impact:** 🟢 **LOW** - Works but less modular

**Recommendation:** ⚠️ **Consider refactoring** for consistency

---

### 2.4 `local_authentication_options.py`

| Aspect | Agent Framework | Claude Agent | Parity |
|--------|----------------|--------------|--------|
| **Data class** | ✅ `@dataclass` | ✅ `@dataclass` | ✅ 100% |
| **Fields** | `env_id`, `bearer_token` | `bearer_token`, `env_id` | ✅ Same fields |
| **Validation** | ✅ `is_valid`, `validate()`, `__post_init__` | ❌ None | ⚠️ Missing |
| **from_environment** | ✅ Uses ENV_ID var | ✅ Uses ENVIRONMENT_ID var | ⚠️ Different var name |
| **Logging** | ✅ Prints config | ❌ Silent | ⚠️ Different |
| **to_dict** | ✅ Serialization support | ❌ Missing | ⚠️ Missing |

**Impact:** 🟢 **LOW** - Both work, agent-framework version is more robust

**Recommendation:**
```python
# TODO (Optional): Add validation to Claude's LocalAuthenticationOptions
# Add: is_valid property, validate() method, to_dict() method
# OR: Keep simple version - current version works fine
```

---

### 2.5 `token_cache.py`

| Aspect | Agent Framework | Claude Agent | Parity |
|--------|----------------|--------------|--------|
| **cache_agentic_token** | ✅ Yes | ✅ Yes | ✅ 100% |
| **get_cached_agentic_token** | ✅ Yes | ✅ Yes | ✅ 100% |
| **clear_token_cache** | ❌ Missing | ✅ Present | ➕ Claude has extra |
| **Implementation** | Identical | Identical + clear | ⚠️ 95% |

**Impact:** 🟢 **LOW** - Claude has slightly more functionality

**Recommendation:**
```python
# TODO (Optional): Add clear_token_cache() to agent-framework version
def clear_token_cache() -> None:
    """Clear all cached tokens."""
    _token_cache.clear()
    logger.debug("Token cache cleared")
```

---

### 2.6 `start_with_generic_host.py`

| Aspect | Agent Framework | Claude Agent | Parity |
|--------|----------------|--------------|--------|
| **Structure** | ✅ Import + main() | ✅ Import + main() | ✅ 100% |
| **Error handling** | ✅ Try/except | ✅ Try/except | ✅ 100% |
| **Agent import** | `AgentFrameworkAgent` | `ClaudeAgent` | Expected difference |
| **Logging** | Basic | ✅ With emoji | Cosmetic |

**Impact:** 🟢 **NONE** - Identical pattern

---

### 2.7 `pyproject.toml` - Dependencies

#### Agent Framework Dependencies

**Core AI:**
- `agent-framework-azure-ai` - AgentFramework SDK
- Azure OpenAI client (via agent-framework)

**Agent365 Extensions:**
- `microsoft_agents_a365_tooling` - MCP tooling
- `microsoft_agents_a365_tooling_extensions_agentframework` - AgentFramework integration
- `microsoft_agents_a365_observability_extensions_agent_framework` - Auto-instrumentation
- `microsoft_agents_a365_notifications` - Email/Word notifications
- `microsoft_agents_a365_runtime`

**Additional:**
- `uvicorn`, `fastapi` - For MCP server hosting
- `httpx` - HTTP client for MCP
- `pydantic` - Data validation

#### Claude Agent Dependencies

**Core AI:**
- `claude-agent-sdk>=0.1.0` - Claude Agent SDK

**Agent365 Extensions:**
- ❌ **NO** `microsoft_agents_a365_tooling`
- ❌ **NO** `microsoft_agents_a365_tooling_extensions_*`
- ❌ **NO** `microsoft_agents_a365_observability_extensions_*`
- ❌ **NO** `microsoft_agents_a365_notifications`
- ✅ `microsoft_agents_a365_observability_core` - Manual observability only
- ✅ `microsoft_agents_a365_runtime`

**Missing:**
- ❌ No `uvicorn`, `fastapi` - Cannot host MCP servers
- ❌ No `httpx` - No HTTP client
- ❌ No `pydantic` - No validation

**Impact:** 🔴 **CRITICAL** - Missing dependencies prevent MCP and notification support

---

### 2.8 `.env.template`

Both files now have parity after the recent update! ✅

| Variable Category | Agent Framework | Claude Agent | Status |
|-------------------|----------------|--------------|--------|
| **Claude Config** | ❌ | ✅ `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | Expected |
| **OpenAI Config** | ✅ | ✅ | ✅ Parity achieved |
| **MCP Config** | ✅ | ✅ | ✅ Parity achieved |
| **Agent365 Config** | ✅ | ✅ | ✅ Parity achieved |
| **Agentic Auth** | ✅ | ✅ | ✅ Parity achieved |
| **Observability** | ✅ | ✅ | ✅ Parity achieved |

---

## 3. Feature Gap Summary

### 🔴 Critical Gaps (Must Fix)

| # | Feature | Agent Framework | Claude Agent | Priority |
|---|---------|----------------|--------------|----------|
| 1 | **MCP Server Integration** | ✅ Full | ❌ None | 🔴 **P0** |
| 2 | **Notification Handling** (Email, Word) | ✅ Full | ❌ None | 🔴 **P0** |
| 3 | **Notification Dependencies** | ✅ Installed | ❌ Missing | 🔴 **P0** |
| 4 | **MCP Dependencies** (uvicorn, fastapi, httpx) | ✅ Installed | ❌ Missing | 🔴 **P0** |

### 🟡 Medium Gaps (Should Fix)

| # | Feature | Agent Framework | Claude Agent | Priority |
|---|---------|----------------|--------------|----------|
| 5 | **Baggage Context** | ✅ Yes | ❌ No | 🟡 **P1** |
| 6 | **Auto-Instrumentation** | ✅ Yes | ❌ No | 🟡 **P1** |
| 7 | **Token Cache in Handler** | ✅ Modular | ⚠️ Different location | 🟡 **P2** |

### 🟢 Minor Gaps (Nice to Have)

| # | Feature | Agent Framework | Claude Agent | Priority |
|---|---------|----------------|--------------|----------|
| 8 | **Auth Options Validation** | ✅ Yes | ❌ No | 🟢 **P3** |
| 9 | **Token Cache Clear** | ❌ No | ✅ Yes | 🟢 **P3** |
| 10 | **Observability Helpers** | ❌ No | ✅ Yes | 🟢 **P3** |

---

## 4. Action Items for Claude Agent

### Phase 1: Critical Features (P0)

#### 1.1 Add MCP Support

**Files to modify:**
- `pyproject.toml`
- `agent.py`

**Changes:**

```toml
# pyproject.toml - Add dependencies
dependencies = [
    # ... existing ...
    
    # MCP Support
    "microsoft_agents_a365_tooling >= 0.1.0",
    "microsoft_agents_a365_tooling_extensions_agentframework >= 0.1.0",
    
    # MCP Server hosting
    "uvicorn[standard]>=0.20.0",
    "fastapi>=0.100.0",
    "httpx>=0.24.0",
    "pydantic>=2.0.0",
]
```

```python
# agent.py - Add MCP initialization
from microsoft_agents_a365.tooling.extensions.agentframework.services.mcp_tool_registration_service import (
    McpToolRegistrationService,
)

class ClaudeAgent(AgentInterface):
    def __init__(self):
        # ... existing code ...
        self._initialize_mcp_services()
        self.mcp_servers_initialized = False
    
    def _initialize_mcp_services(self):
        """Initialize MCP services"""
        try:
            self.tool_service = McpToolRegistrationService()
            logger.info("✅ MCP tool service initialized")
        except Exception as e:
            logger.warning(f"⚠️ MCP tool service failed: {e}")
            self.tool_service = None
    
    async def setup_mcp_servers(self, auth: Authorization, context: TurnContext):
        """Set up MCP server connections"""
        # Copy implementation from agent-framework/agent.py
        # Lines 184-230
```

#### 1.2 Add Notification Support

**Files to modify:**
- `pyproject.toml`
- `agent.py`
- `host_agent_server.py`

**Changes:**

```toml
# pyproject.toml
dependencies = [
    # ... existing ...
    "microsoft_agents_a365_notifications >= 0.1.0",
]
```

```python
# agent.py - Add notification handler
from microsoft_agents_a365.notifications.agent_notification import NotificationTypes

async def handle_agent_notification_activity(
    self, notification_activity, auth: Authorization, context: TurnContext
) -> str:
    """Handle agent notification activities"""
    # Copy implementation from agent-framework/agent.py
    # Lines 281-346
```

```python
# host_agent_server.py - Register notification handlers
from microsoft_agents_a365.notifications.agent_notification import (
    AgentNotification,
    AgentNotificationActivity,
    ChannelId,
)

def __init__(self, ...):
    # ... existing code ...
    self.agent_notification = AgentNotification(self.agent_app)
    
def _setup_handlers(self):
    # ... existing code ...
    
    # Add notification handler
    @self.agent_notification.on_agent_notification(
        channel_id=ChannelId(channel="agents", sub_channel="*"),
        auth_handlers=handler,
    )
    async def on_notification(...):
        # Copy from agent-framework/host_agent_server.py
        # Lines 183-212
```

---

### Phase 2: Observability Improvements (P1)

#### 2.1 Add Baggage Context

**File:** `host_agent_server.py`

```python
# Import
from microsoft_agents_a365.observability.core.middleware.baggage_builder import (
    BaggageBuilder,
)

# Modify message handler
@self.agent_app.activity("message", auth_handlers=handler)
async def on_message(context: TurnContext, _: TurnState):
    # Extract tenant and agent IDs
    tenant_id = context.activity.recipient.tenant_id
    agent_id = context.activity.recipient.agentic_app_id
    
    # Wrap in baggage context
    with BaggageBuilder().tenant_id(tenant_id).agent_id(agent_id).build():
        # ... existing message processing ...
```

#### 2.2 Add Token Cache Setup Method

**File:** `host_agent_server.py`

```python
async def _setup_observability_token(
    self, context: TurnContext, tenant_id: str, agent_id: str
):
    """Cache observability token for Agent365 exporter"""
    try:
        from microsoft_agents_a365.runtime.environment_utils import (
            get_observability_authentication_scope,
        )
        
        exaau_token = await self.agent_app.auth.exchange_token(
            context,
            scopes=get_observability_authentication_scope(),
            auth_handler_id="AGENTIC",
        )
        cache_agentic_token(tenant_id, agent_id, exaau_token.token)
    except Exception as e:
        logger.warning(f"⚠️ Failed to cache observability token: {e}")
```

---

### Phase 3: Optional Improvements (P2-P3)

#### 3.1 Add Validation to LocalAuthenticationOptions

```python
# local_authentication_options.py
@property
def is_valid(self) -> bool:
    """Check if authentication options are valid"""
    return bool(self.bearer_token)

def validate(self) -> None:
    """Validate required parameters"""
    if not self.bearer_token and os.getenv("USE_AGENTIC_AUTH") != "true":
        raise ValueError("bearer_token is required when not using agentic auth")

def to_dict(self) -> dict:
    """Convert to dictionary"""
    return {"bearer_token": self.bearer_token, "env_id": self.env_id}
```

#### 3.2 Add Clear Function to Agent Framework Token Cache

```python
# agent-framework/token_cache.py
def clear_token_cache() -> None:
    """Clear all cached tokens."""
    _agentic_token_cache.clear()
    logger.debug("Token cache cleared")
```

#### 3.3 Extract Observability Helpers in Agent Framework

Create `agent-framework/observability_helpers.py` based on Claude's version.

---

## 5. Recommendations

### For Claude Agent (Immediate)

1. ✅ **Add MCP dependencies** to `pyproject.toml`
2. ✅ **Add notification dependencies** to `pyproject.toml`
3. ✅ **Implement MCP setup** in `agent.py`
4. ✅ **Implement notification handling** in `agent.py` and `host_agent_server.py`
5. ⚠️ **Add baggage context** for distributed tracing
6. ⚠️ **Add token cache setup** method to host

### For Agent Framework (Optional)

1. ℹ️ **Extract observability helpers** to separate module (like Claude)
2. ℹ️ **Add token cache clear** function
3. ℹ️ **Consider adding extended thinking** support (if moving to Claude backend)

### For Both

1. 📚 **Standardize** `LocalAuthenticationOptions` implementation
2. 📚 **Align** environment variable naming (ENV_ID vs ENVIRONMENT_ID)
3. 📚 **Share common code** via a `common/` directory
4. 📚 **Document** the differences in each README

---

## 6. Conclusion

### Current State

- **Agent Framework**: Feature-complete with MCP, notifications, and auto-instrumentation
- **Claude Agent**: Simpler, cleaner code with manual observability, but **missing critical Agent365 features**

### Path to Parity

**Effort Estimate:**
- Phase 1 (MCP + Notifications): **~4-6 hours**
- Phase 2 (Observability improvements): **~2-3 hours**
- Phase 3 (Optional improvements): **~1-2 hours**

**Total: ~7-11 hours of development + testing**

### Testing Checklist

After implementing changes, test:

- [ ] Claude agent starts successfully
- [ ] Basic chat works
- [ ] MCP servers connect and provide tools
- [ ] Email notifications trigger agent response
- [ ] Word @mention notifications work
- [ ] Observability traces appear in Agent365 backend
- [ ] Baggage context propagates correctly
- [ ] Token caching works for observability
- [ ] Health endpoint returns correct status
- [ ] Both agentic and anonymous auth modes work

---

**End of Parity Analysis**
