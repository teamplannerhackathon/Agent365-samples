# Sample Agent - Node.js LangChain

This directory contains a quickstart agent implementation using Node.js and LangChain.

## Demonstrates

This sample is used to demonstrate how to build an agent using the Agent365 framework with Node.js and LangChain.
Please refer to this [quickstart guide](https://review.learn.microsoft.com/en-us/microsoft-agent-365/developer/quickstart-nodejs-langchain?branch=main) on how to extend your agent using Agent365 SDK.

## Prerequisites

- Node.js 18+
- LangChain
- Agents SDK

## How to run this sample

1. **Setup environment variables**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start the agent**
   ```bash
   npm start
   ```

5. **Optionally, while testing you can run in dev mode**
   ```bash
   npm run dev
   ```

The agent will start and be ready to receive requests through the configured hosting mechanism.
