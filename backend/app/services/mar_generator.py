"""app/services/mar_generator.py

Phase 9: AI Auto-MAR Report Generation
Fetches the anomaly context from the database and uses Gemini to generate a 
Market Abuse Report (MAR) explaining the threat, the features, and the severity.
"""
import json
import logging
import os

from fastapi import HTTPException, status
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


def generate_mar(context_data: dict) -> str:
    """
    Fetch the alert context, and ask Gemini 1.5 Flash to generate a
    suspicious activity report.
    Returns Markdown text.

    Args:
        context_data: A dictionary containing the necessary DB properties.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY not configured in .env",
        )

    # 2. Prepare Context Prompt
    anomalies_text = ""
    for a in context_data.get("anomalies", []):
        try:
            features = json.dumps(json.loads(a['anomaly_features']), indent=2) if a.get('anomaly_features') else 'N/A'
        except Exception:
            features = str(a.get('anomaly_features', 'N/A'))
            
        anomalies_text += f"""
        ---
        - Anomaly ID: {a['anomaly_id']}
        - Symbol: {a['md_symbol']}
        - Timestamp: {a['md_timestamp']}
        - Price: {a['md_close']} | Volume: {a['md_volume']}
        - Overall Score: {a['anomaly_score']}
        - Isolation Forest Score: {a['anomaly_if']}
        - Random Forest Score: {a['anomaly_rf']}
        - Features: {features}
        """

    if not anomalies_text:
        anomalies_text = "No specific anomalies have been linked to this case yet."

    context = f"""
    You are an expert financial compliance officer. Please generate a Market Abuse Regulation (MAR) Report
    for the following investigation Case.
    
    Case ID: {context_data['case_id']}
    Case Title: {context_data['case_title']}
    Case Status: {context_data['case_status']}
    Created At: {context_data['case_created_at']}
    
    This Case contains the following anomalous market events forming a timeline of suspicious activity:
    {anomalies_text}
    
    Please structure the report with:
    1. Executive Summary
    2. Investigation Timeline (summarizing the events above)
    3. Technical ML Breakdown (explain the Isolation Forest vs Random Forest scores across the events)
    4. Compliance Action Recommended
    
    Use clear Markdown format. Make it look professional.
    """
    
    # 3. Call Gemini
    try:
        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=30000)
        )
        try:
            model_name = os.getenv("GEMINI_MODEL", "").strip() or "gemini-3.5-flash"
            response = client.models.generate_content(
                model=model_name,
                contents=context,
            )
            return response.text
        finally:
            client.close()
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate report: {e}",
        )
