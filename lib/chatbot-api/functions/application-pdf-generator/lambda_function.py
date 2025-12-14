"""
Application PDF Generator Lambda Function

This Lambda function generates tagged PDFs from application data using Playwright.
It creates a well-structured HTML document and converts it to a tagged PDF for accessibility.
"""

import json
import os
import base64
import glob
from typing import Dict, Any, Optional

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Warning: Playwright not available. PDF generation will fail.")

# Similar to Puppeteer's chromium.executablePath() approach
# Playwright is provided via Lambda layer (playwright-layer.zip)
# Lambda layers are mounted to /opt, so Playwright will be at /opt/python/lib/python3.12/site-packages/
CHROMIUM_EXECUTABLE_PATH = None

# Try to find Chromium executable in common Lambda locations
# Similar to how @sparticuz/chromium works for Puppeteer
# Note: Chromium browser binaries need to be provided separately (not in the layer)
possible_chromium_paths = [
    '/opt/chromium/chromium',  # If using a Lambda-optimized Chromium (like @sparticuz/chromium)
    '/opt/python/lib/python3.12/site-packages/playwright/driver/.local-browsers/chromium-*/chrome-linux/chrome',
    '/opt/ms-playwright/chromium-*/chrome-linux/chrome',
]

for path_pattern in possible_chromium_paths:
    if '*' in path_pattern:
        # Handle glob patterns
        matches = glob.glob(path_pattern)
        if matches:
            CHROMIUM_EXECUTABLE_PATH = matches[0]
            break
    elif os.path.exists(path_pattern):
        CHROMIUM_EXECUTABLE_PATH = path_pattern
        break


def generate_html_from_draft(draft_data: Dict[str, Any]) -> str:
    """
    Generate HTML content from draft data for PDF conversion.
    
    Args:
        draft_data: Dictionary containing draft information including:
            - title: Application title
            - projectBasics: Dictionary of project basic information
            - sections: Dictionary of section names and content
    
    Returns:
        HTML string ready for PDF conversion
    """
    title = draft_data.get('title', 'Grant Application')
    project_basics = draft_data.get('projectBasics', {})
    sections = draft_data.get('sections', {})
    
    # Build project basics HTML
    project_basics_html = ""
    if project_basics:
        project_basics_html = "<div class='project-basics'>"
        for key, value in project_basics.items():
            if value:
                project_basics_html += f"<p><strong>{key}:</strong> {value}</p>"
        project_basics_html += "</div>"
    
    # Build table of contents
    toc_html = ""
    if sections:
        toc_html = "<div class='toc'><h2>Table of Contents</h2><ol>"
        for idx, section_name in enumerate(sections.keys(), 1):
            toc_html += f"<li><a href='#section-{idx}'>{section_name}</a></li>"
        toc_html += "</ol></div>"
    
    # Build sections HTML
    sections_html = ""
    for idx, (section_name, content) in enumerate(sections.items(), 1):
        sections_html += f"""
        <section id='section-{idx}' class='section'>
            <h2>{idx}. {section_name}</h2>
            <div class='content'>{content}</div>
        </section>
        """
    
    # Complete HTML document with semantic structure for accessibility
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        @page {{
            size: A4;
            margin: 40pt 50pt;
        }}
        body {{
            font-family: 'Times New Roman', serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            max-width: 100%;
            margin: 0;
            padding: 0;
        }}
        h1 {{
            font-size: 18pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 14pt;
            page-break-after: avoid;
        }}
        h2 {{
            font-size: 13pt;
            font-weight: bold;
            margin-top: 20pt;
            margin-bottom: 9pt;
            page-break-after: avoid;
        }}
        .project-basics {{
            text-align: center;
            margin-bottom: 20pt;
        }}
        .project-basics p {{
            margin: 8pt 0;
        }}
        .toc {{
            margin: 30pt 0;
            page-break-after: always;
        }}
        .toc ol {{
            list-style: none;
            padding-left: 0;
        }}
        .toc li {{
            margin: 8pt 0;
            padding-left: 30pt;
            text-indent: -30pt;
        }}
        .toc li::before {{
            content: leader('.') ' ';
        }}
        .section {{
            margin-bottom: 20pt;
            page-break-inside: avoid;
        }}
        .content {{
            margin-top: 9pt;
            text-align: justify;
        }}
        .footer {{
            position: fixed;
            bottom: 20pt;
            width: 100%;
            text-align: center;
            font-size: 10pt;
            color: #666;
        }}
        @media print {{
            .toc {{
                page-break-after: always;
            }}
        }}
    </style>
</head>
<body>
    <header>
        <h1>SAFE STREETS FOR ALL GRANT APPLICATION</h1>
        <h2 style="font-size: 14pt; font-weight: normal; text-align: center;">{title}</h2>
    </header>
    
    {project_basics_html}
    
    {toc_html}
    
    <main>
        {sections_html}
    </main>
    
    <footer class="footer">
        Generated by AI. Please review and edit as needed before submission.
    </footer>
</body>
</html>"""
    
    return html


def generate_pdf(html_content: str) -> bytes:
    """
    Generate PDF from HTML content using Playwright.
    
    Args:
        html_content: HTML string to convert to PDF
    
    Returns:
        PDF bytes
    """
    if not PLAYWRIGHT_AVAILABLE:
        raise RuntimeError("Playwright is not available. Cannot generate PDF.")
    
    with sync_playwright() as p:
        # Launch browser with Lambda-optimized settings
        # Similar to Puppeteer's chromium.args approach
        launch_options = {
            'headless': True,
            'args': [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',  # Important for Lambda
                '--disable-gpu',
            ]
        }
        
        # Use explicit Chromium path if available (similar to chromium.executablePath())
        # Playwright layer provides the Python package, but Chromium needs to be provided separately
        if CHROMIUM_EXECUTABLE_PATH and os.path.exists(CHROMIUM_EXECUTABLE_PATH):
            launch_options['executable_path'] = CHROMIUM_EXECUTABLE_PATH
        
        browser = p.chromium.launch(**launch_options)
        page = browser.new_page()
        
        # Set content and wait for it to load
        page.set_content(html_content, wait_until='networkidle')
        
        # Generate PDF with tagged structure (Chromium automatically tags PDFs)
        pdf_bytes = page.pdf(
            format='A4',
            print_background=True,
            margin={
                'top': '40pt',
                'right': '50pt',
                'bottom': '40pt',
                'left': '50pt'
            }
        )
        
        browser.close()
        
        return pdf_bytes


def lambda_handler(event, context):
    """
    Lambda handler for PDF generation.
    
    Expected event structure:
    {
        "body": {
            "draftData": {
                "title": "...",
                "projectBasics": {...},
                "sections": {...}
            }
        }
    }
    """
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        draft_data = body.get('draftData', {})
        
        if not draft_data:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'error': 'draftData is required'
                })
            }
        
        # Validate required fields
        if not draft_data.get('sections'):
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                'body': json.dumps({
                    'error': 'draftData.sections is required'
                })
            }
        
        # Generate HTML from draft data
        html_content = generate_html_from_draft(draft_data)
        
        # Generate PDF
        pdf_bytes = generate_pdf(html_content)
        
        # Return PDF as base64 encoded string
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="grant-application.pdf"'
            },
            'body': pdf_base64,
            'isBase64Encoded': True
        }
        
    except Exception as e:
        print(f"Error generating PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({
                'error': 'Failed to generate PDF',
                'message': str(e)
            })
        }

