import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Email configuration from environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", SMTP_USERNAME)
SENDER_NAME = os.getenv("SENDER_NAME", "Voice Translation App")

# SendGrid configuration (alternative)
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")


def send_email_smtp(to_email: str, subject: str, body: str, html_body: str = None,
                    smtp_username: str = None, smtp_password: str = None) -> dict:
    # Use per-request creds if provided, fall back to .env
    username = smtp_username or SMTP_USERNAME
    password = smtp_password or SMTP_PASSWORD
    sender   = smtp_username or SENDER_EMAIL

    if not username or not password:
        raise Exception(
            "Email not configured. Set your Gmail address and App Password in Profile. "
            "Generate an App Password at: https://myaccount.google.com/apppasswords"
        )

    try:
        logger.info(f"Sending email to {to_email} via SMTP as {username}")

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{SENDER_NAME} <{sender}>"
        message["To"] = to_email

        message.attach(MIMEText(body, "plain"))
        if html_body:
            message.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(username, password)
            server.send_message(message)

        logger.info(f"Email sent successfully to {to_email}")
        return {"success": True, "message": f"Email sent successfully to {to_email}", "provider": "SMTP"}

    except Exception as e:
        logger.error(f"SMTP email error: {e}")
        raise Exception(f"Failed to send email: {str(e)}")


def send_email_sendgrid(to_email: str, subject: str, body: str, html_body: str = None) -> dict:
    """
    Sends an email using SendGrid API
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        body: Plain text body
        html_body: Optional HTML body
    
    Returns:
        dict with success status and message
    
    Configuration:
        Set SENDGRID_API_KEY in .env file
        Get your API key from: https://app.sendgrid.com/settings/api_keys
    """
    if not SENDGRID_API_KEY:
        raise Exception(
            "SendGrid not configured. Set SENDGRID_API_KEY in .env file. "
            "Get your API key from: https://app.sendgrid.com/settings/api_keys"
        )
    
    try:
        import requests
        
        logger.info(f"Sending email to {to_email} via SendGrid")
        
        url = "https://api.sendgrid.com/v3/mail/send"
        
        headers = {
            "Authorization": f"Bearer {SENDGRID_API_KEY}",
            "Content-Type": "application/json"
        }
        
        content = [{"type": "text/plain", "value": body}]
        if html_body:
            content.append({"type": "text/html", "value": html_body})
        
        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": SENDER_EMAIL, "name": SENDER_NAME},
            "subject": subject,
            "content": content
        }
        
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code in [200, 202]:
            logger.info(f"Email sent successfully via SendGrid to {to_email}")
            return {
                "success": True,
                "message": f"Email sent successfully to {to_email}",
                "provider": "SendGrid"
            }
        else:
            logger.error(f"SendGrid error: {response.status_code} - {response.text}")
            raise Exception(f"SendGrid API error: {response.status_code} - {response.text}")
            
    except ImportError:
        raise Exception("requests library not installed. Run: pip install requests")
    except Exception as e:
        logger.error(f"SendGrid email error: {e}")
        raise Exception(f"Failed to send email via SendGrid: {str(e)}")


def send_email(to_email: str, subject: str, body: str, html_body: str = None,
               use_sendgrid: bool = False, smtp_username: str = None, smtp_password: str = None) -> dict:
    if use_sendgrid and SENDGRID_API_KEY:
        return send_email_sendgrid(to_email, subject, body, html_body)
    else:
        return send_email_smtp(to_email, subject, body, html_body, smtp_username, smtp_password)


def format_email_body(text: str, tone: str = None, language: str = None) -> tuple:
    """
    Formats the email body with proper styling
    
    Args:
        text: The main text content
        tone: Optional tone style used
        language: Optional language
    
    Returns:
        tuple of (plain_text, html_body)
    """
    # Plain text version
    plain_text = f"""
Voice Translation App - Translated Message

{text}

---
Generated by Voice Translation App
"""
    
    if tone:
        plain_text += f"Tone Style: {tone}\n"
    if language:
        plain_text += f"Language: {language}\n"
    
    # HTML version
    html_body = f"""
    <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }}
                .content {{ background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }}
                .footer {{ background-color: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }}
                .metadata {{ margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🌍 Voice Translation App</h2>
                </div>
                <div class="content">
                    <p>{text.replace(chr(10), '<br>')}</p>
                    <div class="metadata">
    """
    
    if tone:
        html_body += f"<p><strong>Tone Style:</strong> {tone}</p>"
    if language:
        html_body += f"<p><strong>Language:</strong> {language}</p>"
    
    html_body += """
                    </div>
                </div>
                <div class="footer">
                    <p>Generated by Voice Translation App</p>
                </div>
            </div>
        </body>
    </html>
    """
    
    return plain_text, html_body
