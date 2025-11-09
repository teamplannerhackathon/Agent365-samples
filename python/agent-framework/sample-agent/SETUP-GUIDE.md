# Quick Setup Guide

Get the A365 Python SDK sample running in 7 simple steps.

## Setup Steps

### 1. Verify prerequisites
First, ensure you have the required Microsoft Agent365 packages:

```powershell
# Navigate to the agent-framework directory (parent of sample-agent)
cd ..

# Check if dist folder exists with required wheel files
ls dist
```

**If the dist folder doesn't exist or is empty:**
- Create the `dist` folder: `mkdir dist`
- Download or copy the required `.whl` files to the `dist` folder:
-  https://github.com/microsoft/Agent365-python/actions/runs/19200334217
 - Click on Artifacts - python-3.11
 - Download the zip file and extract the wheel files into the `dist` folder
  - `microsoft_agents_a365_tooling-*.whl`
  - `microsoft_agents_a365_tooling_extensions_agentframework-*.whl`
  - `microsoft_agents_a365_observability_core-*.whl`
  - `microsoft_agents_a365_observability_extensions_agent_framework-*.whl`
  - `microsoft_agents_a365_runtime-*.whl`
  - `microsoft_agents_a365_notifications-*.whl`

**✅ Success Check**: The `dist` folder should contain the Microsoft Agent365 wheel files.

```powershell
# Return to sample-agent directory for next steps
cd sample-agent
```

### 2. Set up environment configuration
Open PowerShell **in VS Code** (Terminal → New Terminal) and navigate to the sample-agent directory:

```powershell
# Navigate to the sample-agent directory (where this README is located)
# Make sure you're in the sample-agent folder
cd sample-agent

# Copy the environment template
copy .env.template .env
```

### 3. Update environment variables
Open the newly created `.env` file and update the following values:

```
AZURE_OPENAI_API_KEY=<your_azure_openai_api_key>
AZURE_OPENAI_ENDPOINT=<your_azure_openai_endpoint>
AZURE_OPENAI_DEPLOYMENT=<your_azure_openai_deployment>
AZURE_OPENAI_API_VERSION="2024-02-01"
```

### 4. Install uv
uv is a fast Python package manager. Open PowerShell **in VS Code** (Terminal → New Terminal) and run:

```powershell
# Install uv
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# Add uv to PATH for this session (only if not already there)
if ($env:PATH -notlike "*$env:USERPROFILE\.local\bin*") {
    $env:PATH += ";$env:USERPROFILE\.local\bin"
}

# Test that uv works
uv --version
```

### 5. Set up the project
Continue in the same terminal (make sure you're still in the sample-agent directory):

```powershell
# Verify you're in the right directory - you should see pyproject.toml
ls pyproject.toml

# First, check if Python is installed
python --version
```

**If Python is not found:**
- Download and install Python 3.11+ from https://python.org
- Make sure to check "Add Python to PATH" during installation
- Restart VS Code and try again

**If Python is found, continue:**
```powershell
# Create virtual environment with pip included
uv venv .venv --seed

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Verify setup - you should see (.venv) in your prompt
python --version
```

**✅ Success Check**: Your terminal shows `(.venv)` at the beginning and you can see pyproject.toml in the directory

### 6. Install dependencies

Due to version constraints in the wheel files, we install in two steps:

```powershell
### 3. Install dependencies
```powershell
uv pip install -e . --find-links ../dist --pre

**Important**: You may see some warning messages about dependencies. **This is normal and expected** - the agent will work correctly.

**✅ Success Check**: 
- First command: "Installed X packages" (PyPI dependencies from requirements.txt)

### 7. Start the agent
```powershell
python start_with_generic_host.py
```

**✅ Success Check**: You should see:
```
🚀 Starting server on localhost:3978
🎯 Ready for testing!
======== Running on http://localhost:3978 ========
```

## Troubleshooting

**"python is not recognized"** → Install Python 3.11+ from python.org and check "Add Python to PATH"

**"uv not found"** → Restart your terminal and try step 1 again

**"No module named 'dotenv'"** → Try: `uv pip install python-dotenv`

**"No module named..."** → Make sure you see `(.venv)` in your prompt and that all three installation commands in step 6 completed successfully. Most missing dependencies should already be included in `requirements.txt`, but if you still get errors, you can install them individually:
```powershell
# For any additional missing modules:
uv pip install <module-name>
```

**Dependency conflict warnings** → These are expected! Continue with the next step - the agent will work fine

**"No solution found when resolving dependencies"** → Make sure you're using the three-step installation process in step 6 and that the dist folder exists with wheel files

**Agent won't start** → Check you're in the sample-agent directory and that all installation steps completed successfully

## Done! 
Your agent is now running and ready for testing. Configuration values will be provided during the bug bash session.