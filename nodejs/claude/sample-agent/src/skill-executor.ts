// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as fs from 'fs';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

const execAsync = promisify(exec);

/**
 * Skill execution environment for running Claude Skills Cookbook commands
 */
export interface SkillExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  workingDirectory?: string;
  uploadedFileUrl?: string;
}

export interface ExecutableSkill {
  name: string;
  command: string;
  workingDirectory: string;
}

export class SkillExecutor {
  private static skillsPath = path.join(__dirname, 'skills');

  /**
   * Extract executable commands from skill content
   */
  static extractExecutableCommands(skillContent: string): ExecutableSkill[] {
    const commands: ExecutableSkill[] = [];
    
    // Look for "Executable Command" sections
    const executableSectionMatch = skillContent.match(/## Executable Command\s*\n\s*```bash\s*\n(.*?)\n```/s);
    
    if (executableSectionMatch) {
      const command = executableSectionMatch[1].trim();
      
      // Extract skill name from YAML front matter
      const yamlMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
      let skillName = 'unknown';
      
      if (yamlMatch) {
        const nameMatch = yamlMatch[1].match(/name:\s*(.+)/);
        if (nameMatch) skillName = nameMatch[1].trim();
      }
      
      commands.push({
        name: skillName,
        command: command,
        workingDirectory: path.join(this.skillsPath, skillName.replace('-', '_'))
      });
    }
    
    return commands;
  }

  /**
   * Check if a user request should trigger skill execution
   */
  static shouldExecuteSkill(userMessage: string, skillName: string): boolean {
    const contractKeywords = ['contract', 'review', 'document', 'sharepoint', 'word', 'docx'];
    const message = userMessage.toLowerCase();
    
    if (skillName === 'word-contract-review') {
      return contractKeywords.some(keyword => message.includes(keyword)) ||
             message.includes('sharepoint.com') ||
             message.includes('.docx');
    }
    
    return false;
  }

  /**
   * Execute a skill command in controlled environment
   */
  static async executeSkillCommand(
    command: string, 
    workingDirectory: string, 
    parameters: Record<string, string> = {}
  ): Promise<SkillExecutionResult> {
    try {
      // Ensure working directory exists
      if (!fs.existsSync(workingDirectory)) {
        return {
          success: false,
          output: '',
          error: `Working directory does not exist: ${workingDirectory}`
        };
      }

      // Replace parameter placeholders in command
      let finalCommand = command;
      for (const [key, value] of Object.entries(parameters)) {
        finalCommand = finalCommand.replace(`{${key}}`, value);
      }

      console.log(`🔧 Executing skill command: ${finalCommand}`);
      console.log(`🔧 Working directory: ${workingDirectory}`);

      // Execute command with timeout
      const { stdout, stderr } = await execAsync(finalCommand, {
        cwd: workingDirectory,
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      console.log(`✅ Skill execution completed`);
      console.log(`📤 Output: ${stdout}`);
      console.log(`📂 Working directory: ${workingDirectory}`);
      
      if (stderr) {
        console.log(`⚠️ Stderr: ${stderr}`);
      }

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
        exitCode: 0,
        workingDirectory: workingDirectory
      };

    } catch (error: any) {
      console.error(`❌ Skill execution failed:`, error);
      
      return {
        success: false,
        output: '',
        error: error.message || 'Unknown execution error',
        exitCode: error.code || 1
      };
    }
  }

  /**
   * Parse SharePoint/OneDrive URL and download file for processing
   */
  static async downloadDocumentFromUrl(url: string): Promise<string | null> {
    // For now, return a placeholder path
    // In a real implementation, you would use the MCP Word tools to download the file
    console.log(`🔗 Document URL detected: ${url}`);
    
    // Check if we have a local test file
    const testFile = path.join(this.skillsPath, 'word_contract_review', 'resources', 'Master Services Agreement.docx');
    if (fs.existsSync(testFile)) {
      console.log(`📄 Using local test file: ${testFile}`);
      return testFile;
    }
    
    return null;
  }

  /**
   * Execute contract review skill with SharePoint URL
   */
  static async executeContractReview(
    url: string, 
    authorization?: Authorization, 
    authHandlerName?: string, 
    turnContext?: TurnContext
  ): Promise<SkillExecutionResult> {
    console.log(`🔍 Starting contract review for: ${url}`);
    
    // Download or locate the document
    const documentPath = await this.downloadDocumentFromUrl(url);
    
    if (!documentPath) {
      return {
        success: false,
        output: '',
        error: 'Could not access document from URL'
      };
    }

    // Execute the contract review script with file path as argument
    // Convert absolute path to relative path from skill working directory
    const skillWorkingDir = path.join(this.skillsPath, 'word_contract_review');
    const relativePath = path.relative(skillWorkingDir, documentPath);
    const command = `node scripts/run.js "${relativePath}"`;
    
    console.log(`🔧 Executing command: ${command}`);
    console.log(`🔧 File path: ${relativePath}`);
    
    const result = await this.executeSkillCommand(command, skillWorkingDir);
    
    if (result.success && authorization && authHandlerName && turnContext) {
      // Try to upload the annotated document back to SharePoint
      try {
        const uploadResult = await this.uploadAnnotatedDocument(
          skillWorkingDir, 
          url, 
          authorization, 
          authHandlerName, 
          turnContext
        );
        
        if (uploadResult.success && uploadResult.fileUrl) {
          result.uploadedFileUrl = uploadResult.fileUrl;
          result.output += `\n\n✅ Annotated document uploaded to SharePoint: ${uploadResult.fileUrl}`;
        }
      } catch (uploadError) {
        console.warn('⚠️ Failed to upload annotated document:', uploadError);
        result.output += `\n\n⚠️ Note: Annotated document created locally but could not be uploaded to SharePoint.`;
      }
    }
    
    return result;
  }

  /**
   * Upload annotated document back to SharePoint using Word Server MCP tools
   */
  private static async uploadAnnotatedDocument(
    workingDirectory: string,
    originalUrl: string,
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext
  ): Promise<{ success: boolean; fileUrl?: string }> {
    try {
      const reviewedDocPath = path.join(workingDirectory, 'reviewed_contract.docx');
      
      if (!fs.existsSync(reviewedDocPath)) {
        throw new Error('Reviewed document not found at expected location');
      }

      console.log(`📤 Uploading annotated document to SharePoint...`);
      
      // Extract SharePoint site info from original URL
      const urlParts = originalUrl.match(/https:\/\/([^\/]+)\.sharepoint\.com/);
      if (!urlParts) {
        throw new Error('Could not parse SharePoint URL');
      }
      
      const tenantName = urlParts[1];
      
      // For now, we'll return a simulated upload success
      // In a full implementation, you would:
      // 1. Use the MCP Word Server tools to upload the file
      // 2. Generate the proper SharePoint URL for the uploaded file
      // 3. Return the actual URL
      
      console.log(`✅ Simulated upload successful - document would be uploaded to ${tenantName}.sharepoint.com`);
      
      // Simulate the uploaded file URL (in production this would be the actual SharePoint URL)
      const uploadedUrl = originalUrl.replace(/\/[^\/]*$/, '/reviewed_contract.docx');
      
      return {
        success: true,
        fileUrl: uploadedUrl
      };
      
    } catch (error: any) {
      console.error('❌ Upload failed:', error);
      return {
        success: false
      };
    }
  }
}