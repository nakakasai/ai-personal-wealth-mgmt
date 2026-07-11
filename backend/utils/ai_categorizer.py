import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """
You are an AI that classifies financial transactions into categories.
Return only one category from this list:

Food, Shopping, Transport, Health, Entertainment, Utilities, Cash, Salary,
Investment, Education, Rent, Uncategorized
"""

async def ai_category(description: str) -> str:
    if not description:
        return "Uncategorized"

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": description},
        ]
    )

    cat = response.choices[0].message.content
    return cat.strip()
