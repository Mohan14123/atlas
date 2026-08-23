import re
import os

filepath = "/home/mohan/Documents/Codity/docs/prompt.md"
with open(filepath, "r") as f:
    content = f.read()

# 1. Update architecture.mmd
arch_match = re.search(r'## Architecture Design:.*?(```mermaid.*?```)', content, re.DOTALL)
if arch_match:
    arch_mermaid = arch_match.group(1).replace('```mermaid\n', '').replace('```', '').strip()
    with open('/home/mohan/Documents/Codity/docs/architecture.mmd', 'w') as f:
        f.write(arch_mermaid + '\n')

# 2. Update database.mmd
db_match = re.search(r'## Database Design:.*?(```mermaid.*?```)', content, re.DOTALL)
if db_match:
    db_mermaid = db_match.group(1).replace('```mermaid\n', '').replace('```', '').strip()
    with open('/home/mohan/Documents/Codity/docs/database.mmd', 'w') as f:
        f.write(db_mermaid + '\n')
    with open('/home/mohan/Documents/Codity/docs/schema.md', 'w') as f:
        f.write("# Database Schema\n\n```mermaid\n" + db_mermaid + "\n```\n")

# 3. Update api.md
api_match = re.search(r'(## API Design:.*?)(?=\n## |\Z)', content, re.DOTALL)
if api_match:
    api_content = api_match.group(1).strip()
    with open('/home/mohan/Documents/Codity/docs/api.md', 'w') as f:
        f.write(f"# API Reference\n\n{api_content}\n")

# 4. Update architecture.md
# We will extract Problem Statement, Tools, Architecture Design, and Architecture Decisions.
arch_full = ""
arch_design_match = re.search(r'(## Architecture Design:.*?)(?=\n## Repo |\Z)', content, re.DOTALL)
if arch_design_match:
    arch_full += arch_design_match.group(1).strip() + "\n\n"

decisions_match = re.search(r'(## Architecture Decisions you made:.*?)(?=\n## |\Z)', content, re.DOTALL)
if decisions_match:
    arch_full += decisions_match.group(1).strip() + "\n\n"

with open('/home/mohan/Documents/Codity/docs/architecture.md', 'w') as f:
    f.write(f"# Architecture Overview\n\n{arch_full}")

print("Extraction complete.")
