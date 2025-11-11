# Notification Support Added to Claude Agent

**Date:** November 10, 2025  
**Status:** ✅ Complete

---

## Summary

Added full notification support to the Claude Agent sample, enabling it to respond to:
- 📧 **Email notifications** - Process emails and respond to instructions
- 📄 **Word comment notifications** - Respond to @mentions in Word documents
- 📨 **Generic notifications** - Handle other Agent365 notification types

---

## Changes Made

### 1. Updated Dependencies (`pyproject.toml`)

**Added:**
```toml
# Agent365 Notifications (Email, Word @mentions, etc.)
"microsoft_agents_a365_notifications >= 0.1.0",
```

**Location:** After observability dependencies, before runtime package

---

### 2. Enhanced Agent Logic (`agent.py`)

#### 2.1 Added Notification Imports

```python
# Notifications
try:
    from microsoft_agents_a365.notifications.agent_notification import NotificationTypes
    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False
    logger.debug("Notification packages not installed - notification handling disabled")
```

**Location:** After Microsoft Agents SDK imports, before observability imports

#### 2.2 Implemented Notification Handler Method

**Added method:** `handle_agent_notification_activity()`

**Features:**
- Handles `EMAIL_NOTIFICATION` - Processes email body with Claude
- Handles `WPX_COMMENT` - Responds to Word document comments
- Generic notification handling for other types
- Full error handling and logging
- Graceful degradation if notifications unavailable

**Location:** After message processing section, before cleanup section

**Code structure:**
```python
async def handle_agent_notification_activity(
    self, notification_activity, auth: Authorization, context: TurnContext
) -> str:
    """Handle agent notification activities (email, Word mentions, etc.)"""
    # Check availability
    # Extract notification type
    # Handle EMAIL_NOTIFICATION
    # Handle WPX_COMMENT
    # Handle generic notifications
    # Error handling
```

---

### 3. Updated Host Server (`host_agent_server.py`)

#### 3.1 Added Notification Imports

```python
# Notifications imports (optional)
try:
    from microsoft_agents_a365.notifications.agent_notification import (
        AgentNotification,
        AgentNotificationActivity,
        ChannelId,
    )
    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False
```

**Also updated observability imports to include:**
- `BaggageBuilder` - For distributed tracing context
- `cache_agentic_token` - For token caching (previously only imported getter)

#### 3.2 Initialized Notification Support

**In `__init__` method:**
```python
# Initialize notification support if available
if NOTIFICATIONS_AVAILABLE:
    self.agent_notification = AgentNotification(self.agent_app)
    logger.info("✅ Notification handlers will be registered")
else:
    self.agent_notification = None
    logger.info("ℹ️ Notifications not available - skipping notification handlers")
```

#### 3.3 Registered Notification Handler

**In `_setup_handlers` method:**
```python
@self.agent_notification.on_agent_notification(
    channel_id=ChannelId(channel="agents", sub_channel="*"),
    auth_handlers=handler,
)
async def on_notification(
    context: TurnContext,
    state: TurnState,
    notification_activity: AgentNotificationActivity,
):
    """Handle agent notifications (email, Word comments, etc.)"""
    # Validate agent and setup context
    # Wrap in baggage context for observability
    # Call agent's notification handler
    # Send response
    # Error handling
```

**Features:**
- Validates agent availability
- Sets up observability token caching
- Uses baggage context for distributed tracing
- Full error handling with logging
- Graceful fallback if agent doesn't support notifications

#### 3.4 Added Helper Methods

**Method 1: `_validate_agent_and_setup_context()`**
- Extracts tenant_id and agent_id from context
- Validates agent instance availability
- Sets up observability token
- Returns tuple (tenant_id, agent_id) or None

**Method 2: `_setup_observability_token()`**
- Exchanges token for observability scope
- Caches token using `cache_agentic_token()`
- Handles errors gracefully
- Only runs if observability available

---

## Feature Comparison

| Feature | Before | After | Status |
|---------|--------|-------|--------|
| **Email Notifications** | ❌ Not supported | ✅ Full support | ✅ Added |
| **Word Comment Notifications** | ❌ Not supported | ✅ Full support | ✅ Added |
| **Generic Notifications** | ❌ Not supported | ✅ Full support | ✅ Added |
| **Observability Token Caching** | ⚠️ Only in create_and_run_host | ✅ In handler too | ✅ Enhanced |
| **Baggage Context** | ❌ Missing | ✅ Added | ✅ Added |
| **Graceful Degradation** | N/A | ✅ Works without packages | ✅ Added |

---

## Parity with Agent Framework

The Claude agent now has **parity** with the agent-framework sample for notification handling:

| Feature | Agent Framework | Claude Agent | Status |
|---------|----------------|--------------|--------|
| Email Notifications | ✅ | ✅ | ✅ **Parity** |
| Word Notifications | ✅ | ✅ | ✅ **Parity** |
| Notification Dependencies | ✅ | ✅ | ✅ **Parity** |
| Notification Handler Registration | ✅ | ✅ | ✅ **Parity** |
| Baggage Context | ✅ | ✅ | ✅ **Parity** |
| Token Cache Setup | ✅ | ✅ | ✅ **Parity** |

---

## Testing Checklist

After installing dependencies, test the following:

- [ ] Agent starts successfully
- [ ] Basic chat still works (no regression)
- [ ] Email notification triggers notification handler
- [ ] Email content is processed by Claude
- [ ] Claude responds appropriately to email instructions
- [ ] Word @mention notification triggers handler
- [ ] Word comment is processed by Claude
- [ ] Generic notifications are handled
- [ ] Error handling works (invalid notifications)
- [ ] Observability traces include notification spans
- [ ] Baggage context propagates correctly
- [ ] Works gracefully if notification packages not installed

---

## Installation

To enable notification support:

```bash
# Navigate to the Claude agent directory
cd c:\365\Agent365-Samples\python\claude\sample-agent

# Install/update dependencies
uv sync

# Or using pip
pip install microsoft_agents_a365_notifications
```

---

## Usage Example

### Email Notification

When an email arrives:
1. Agent365 sends `EMAIL_NOTIFICATION` activity
2. Host receives notification via `on_notification` handler
3. Agent extracts email body
4. Claude processes: "You have received the following email. Please follow any instructions in it..."
5. Claude analyzes and responds
6. Response sent back to user

### Word Comment Notification

When @mentioned in Word:
1. Agent365 sends `WPX_COMMENT` activity
2. Host receives notification
3. Agent extracts document ID and comment text
4. Claude processes comment (Note: without MCP, cannot retrieve full doc)
5. Claude responds to the comment
6. Response sent back

---

## Known Limitations

1. **Word Document Retrieval:** Without MCP tool support, the agent cannot retrieve the full Word document content. It only processes the comment text directly.
   - **Solution:** Add MCP support (separate task) to enable full document access

2. **Package Installation:** Notification packages must be installed from local index
   - Requires access to `../../../../python/dist` directory

---

## Next Steps

To achieve full parity with agent-framework:

1. ✅ ~~Add notification support~~ - **COMPLETE**
2. ⏭️ Add MCP server integration (Phase 1 - P0)
3. ⏭️ Add auto-instrumentation for observability (Phase 2 - P1)

See `PARITY_ANALYSIS.md` for complete roadmap.

---

## Code Locations

- **Dependencies:** `pyproject.toml` (line ~20)
- **Agent Imports:** `agent.py` (lines ~53-57)
- **Agent Handler:** `agent.py` (lines ~330-418)
- **Host Imports:** `host_agent_server.py` (lines ~42-58)
- **Host Initialization:** `host_agent_server.py` (lines ~109-115)
- **Host Notification Handler:** `host_agent_server.py` (lines ~180-230)
- **Helper Methods:** `host_agent_server.py` (lines ~232-290)

---

**Implementation Complete** ✅
