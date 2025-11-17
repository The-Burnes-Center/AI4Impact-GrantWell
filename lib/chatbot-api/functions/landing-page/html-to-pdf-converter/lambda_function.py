"""
HTML to PDF Converter Lambda Function

This function is triggered by S3 events when HTML files are uploaded to the
pending-conversion/ prefix. It converts HTML files to PDF format and uploads
them to the final location, then deletes the temporary HTML file.
"""

import json
import boto3
import os
from urllib.parse import unquote
from io import BytesIO
from xhtml2pdf import pisa

s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    Converts HTML files uploaded to S3 to PDF format.
    Triggered by S3 event when HTML files are uploaded to pending-conversion/ prefix.
    """
    bucket_name = os.environ.get('BUCKET')
    
    # Process each S3 record
    for record in event.get('Records', []):
        try:
            # Extract S3 event details
            s3_event = record.get('s3', {})
            bucket = s3_event.get('bucket', {}).get('name')
            object_key = unquote(s3_event.get('object', {}).get('key', ''))
            
            # Verify it's an HTML file in pending-conversion
            if not object_key.startswith('pending-conversion/') or not object_key.endswith('.html'):
                print(f'Skipping {object_key}: not an HTML file in pending-conversion/')
                continue
            
            print(f'Processing HTML file: {object_key}')
            
            # Extract opportunity title from path: pending-conversion/{opportunityTitle}/NOFO-File-HTML.html
            path_parts = object_key.split('/')
            if len(path_parts) < 3:
                print(f'Invalid path structure: {object_key}')
                continue
            
            opportunity_title = path_parts[1]  # Second part is the opportunity title
            
            # Download HTML from S3
            html_response = s3_client.get_object(Bucket=bucket, Key=object_key)
            html_content = html_response['Body'].read().decode('utf-8')
            
            print(f'Downloaded HTML for {opportunity_title}, size: {len(html_content)} bytes')
            
            # Convert HTML to PDF using xhtml2pdf (pure Python, no binaries needed)
            try:
                pdf_buffer = BytesIO()
                pisa_status = pisa.CreatePDF(
                    BytesIO(html_content.encode('utf-8')),
                    dest=pdf_buffer
                )
                
                if pisa_status.err:
                    raise Exception(f'PDF creation error: {pisa_status.err}')
                
                pdf_buffer.seek(0)
                pdf_bytes = pdf_buffer.getvalue()
                print(f'Successfully converted HTML to PDF, size: {len(pdf_bytes)} bytes')
            except Exception as pdf_error:
                print(f'Error converting HTML to PDF: {str(pdf_error)}')
                raise
            
            # Upload PDF to final location
            final_pdf_key = f'{opportunity_title}/NOFO-File-PDF'
            s3_client.put_object(
                Bucket=bucket,
                Key=final_pdf_key,
                Body=pdf_bytes,
                ContentType='application/pdf'
            )
            
            print(f'Successfully uploaded PDF: {final_pdf_key}')
            
            # Delete the temporary HTML file
            s3_client.delete_object(
                Bucket=bucket,
                Key=object_key
            )
            
            print(f'Deleted temporary HTML file: {object_key}')
            
        except Exception as e:
            print(f'Error processing record: {str(e)}')
            print(f'Record: {json.dumps(record)}')
            import traceback
            traceback.print_exc()
            # Don't raise - continue processing other records
            continue
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'HTML to PDF conversion completed'})
    }

