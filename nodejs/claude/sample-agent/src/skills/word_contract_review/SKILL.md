---
name: word-contract-review
description: Review Word contracts from SharePoint/OneDrive URLs or uploaded files, flag risky clauses, and return annotated documents with JSON findings.
---

# Word Contract Review Skill

This Skill reviews Word (.docx) contracts from SharePoint URLs or uploaded files, detects risky clauses, annotates the document, and returns a structured JSON list of findings. It integrates with MCP Word tools for SharePoint/OneDrive access and runs in a **controlled Node.js environment**.

## When to Use
Use this Skill when users want to:
- Analyze Word contracts from SharePoint URLs (https://tenant.sharepoint.com/...)
- Review OneDrive Word document links
- Examine uploaded .docx contract files for legal risks
- Get flagged clauses highlighted with risk explanations

## How It Works
1. **Document Access**: 
   - For SharePoint/OneDrive URLs: Use MCP Word tools to fetch document content
   - For uploaded files: Process the `.docx` file directly
2. **Risk Analysis**: Run the Node.js script `scripts/run.js` in controlled execution environment
3. **Processing Actions**:
   - Extract and analyze Word document content
   - Detect key risk clauses including:
     - **Indemnification** - Broad liability obligations
     - **Liability** - Uncapped or unfavorable liability terms
     - **Termination** - Early termination rights and conditions
     - **Governing law** - Jurisdiction and venue provisions
     - **Automatic renewal** - Auto-renewal and extension clauses
   - Annotate document with `[⚠️ REVIEW: <reason>]` markers
   - Generate structured JSON findings with risk assessments

## Input Formats Supported
- **SharePoint URLs**: `https://tenant.sharepoint.com/:w:/...`
- **OneDrive URLs**: `https://tenant-my.sharepoint.com/:w:/...`
- **Direct file upload**: `.docx` files
- **Local resources**: Files placed in `resources/` folder for testing

## Testing Locally
For testing purposes, place contract files in the `resources/` folder and reference them directly:
- Example: "Please review the contract in resources/Master Services Agreement.docx"
- Full path: "Please review the contract at src/skills/word_contract_review/resources/Master Services Agreement.docx"

The available sample contract is: **Master Services Agreement.docx**

## Executable Command
The Skill executes the following command in the sandbox:

```bash
node scripts/run.js {contract_file}
```

- `{contract_file}` is replaced by the sandbox path to the document (downloaded from SharePoint/OneDrive or uploaded directly)

## Outputs
- **`reviewed_contract.docx`** → Annotated Word document with risk markers
- **`findings`** → JSON array of flagged clauses with risk levels and explanations

## Integration Features
- **MCP Word Server**: Seamlessly accesses SharePoint and OneDrive documents
- **Risk Detection**: Comprehensive scanning for common contract risks
- **Structured Analysis**: Organized findings with actionable recommendations
- **Safe Execution**: Sandboxed environment ensures secure processing
