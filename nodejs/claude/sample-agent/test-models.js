// Test different Claude models to find working one
const { configDotenv } = require('dotenv');
configDotenv();

async function testModels() {
  const modelNames = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest', 
    'claude-3-5-sonnet',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229'
  ];
  
  for (const modelName of modelNames) {
    try {
      console.log(`\n🔧 Testing model: ${modelName}`);
      
      const claudeSDK = await import('@anthropic-ai/claude-agent-sdk');
      const { query } = claudeSDK;
      
      const config = {
        model: modelName,
        maxTurns: 1,
        env: { ...process.env },
        systemPrompt: 'You are a helpful assistant.'
      };
      
      delete config.env.NODE_OPTIONS;
      delete config.env.VSCODE_INSPECTOR_OPTIONS;
      
      const result = query({
        prompt: 'Say "test successful"',
        options: config,
      });

      let finalResponse = '';
      for await (const message of result) {
        if (message.type === 'result') {
          finalResponse += message.result;
        }
      }

      console.log(`✅ SUCCESS with ${modelName}:`, finalResponse.substring(0, 100));
      break; // Stop on first success
      
    } catch (error) {
      console.error(`❌ FAILED with ${modelName}:`, error.message.substring(0, 100));
    }
  }
}

testModels();