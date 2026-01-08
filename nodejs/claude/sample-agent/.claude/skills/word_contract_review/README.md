# Word Contract Review Skill

This Skill reviews a Word (.docx) contract and flags risky clauses by annotating the document and returning structured findings.

## Usage

1. Upload a Word contract as `contract_file`.
2. Claude invokes `run.js` in the controlled environment.
3. Outputs:
   - `reviewed_contract.docx` → annotated Word document
   - `findings` → JSON list of detected risk clauses
