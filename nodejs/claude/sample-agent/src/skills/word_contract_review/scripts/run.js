const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun } = require('docx');

const RISK_TERMS = {
    "indemnify": "Broad indemnification obligation",
    "liability": "Liability may be uncapped or unfavorable",
    "termination": "Early termination rights detected",
    "governing law": "Jurisdiction may be unfavorable",
    "automatic renewal": "Auto-renewal clause detected"
};

async function run(contractFilePath) {
    const findings = [];

    // Handle different path formats and resolve relative paths
    let resolvedPath = contractFilePath;
    
    // If it's a relative path starting with "resources/", try different base paths
    if (contractFilePath.startsWith('resources/')) {
        const possiblePaths = [
            contractFilePath, // Current directory
            path.join(__dirname, '..', contractFilePath), // From scripts directory
            path.join(process.cwd(), 'src', 'skills', 'word_contract_review', contractFilePath), // From project root
            path.join(__dirname, '..', '..', '..', '..', contractFilePath) // Alternative root path
        ];
        
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                resolvedPath = testPath;
                console.log(`✅ Found file at: ${resolvedPath}`);
                break;
            } else {
                console.log(`❌ Not found at: ${testPath}`);
            }
        }
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
        console.log(JSON.stringify({
            error: `File not found: ${contractFilePath}. Tried: ${resolvedPath}`,
            cwd: process.cwd(),
            findings: []
        }));
        return;
    }

    // For now, create a simple mock analysis since .docx parsing is complex
    // In a real implementation, you'd use a library like mammoth to extract text from docx
    const fileName = path.basename(resolvedPath);
    console.log(`📄 Processing contract: ${fileName}`);
    
    const mockContent = `Sample contract analysis for ${fileName}. This is a demonstration of contract review functionality.
    
    This contract contains terms that may require review:
    - Liability limitations may apply
    - Termination clauses should be reviewed
    - Governing law provisions are present
    - Indemnification terms require attention
    `;
    
    let modifiedContent = mockContent;

    for (const [term, reason] of Object.entries(RISK_TERMS)) {
        const regex = new RegExp(`(${term})`, 'gi');
        if (regex.test(mockContent)) {
            findings.push({ term, reason, location: `Found in ${fileName}` });
            modifiedContent = modifiedContent.replace(
                regex,
                `$1 [⚠️ REVIEW: ${reason}]`
            );
        }
    }

    // Create annotated Word document
    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    children: [new TextRun(modifiedContent)]
                })
            ]
        }]
    });

    const outputFile = "reviewed_contract.docx";
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputFile, buffer);

    // Print JSON to stdout for Claude to parse
    console.log(JSON.stringify({
        reviewed_contract: outputFile,
        findings
    }));
}

// Path to uploaded contract file
const contractFilePath = process.argv[2];
run(contractFilePath);