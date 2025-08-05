import dotenv
import os
import re
from typing import List, Tuple
import google.generativeai as genai

dotenv.load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY_MINDMAP")

genai.configure(api_key=API_KEY)

def generate_dynamic_system_prompt(
    content: str,
    mindmap_target: str,
    mindmap_language: str,
    mindmap_detailed_level: str
) -> str:
    """
    Generate a dynamic system prompt for mindmap generation based on user settings.
    """

    detail_settings = {
        "brief": {
            "length": "10-20% of original content",
            "focus": "Extract only the most essential points and key conclusions",
            "structure": "Use minimal structure with main points only"
        },
        "moderate": {
            "length": "20-40% of original content",
            "focus": "Include main ideas, supporting details, and important examples",
            "structure": "Use clear sections with subsections where needed"
        },
        "detailed": {
            "length": "40-60% of original content",
            "focus": "Preserve comprehensive information including examples, statistics, and detailed explanations",
            "structure": "Use full hierarchical structure with multiple levels of detail"
        },
        "comprehensive": {
            "length": "60-80% of original content",
            "focus": "Maintain almost all important information while removing only redundancy",
            "structure": "Use extensive structure with deep categorization"
        }
    }

    language_settings = {
        "vietnamese": {
            "instruction": "Tạo tóm tắt HOÀN TOÀN bằng tiếng Việt",
            "tone": "Sử dụng giọng văn tự nhiên, chuyên nghiệp của người Việt",
            "terminology": "Ưu tiên thuật ngữ tiếng Việt, chỉ giữ nguyên thuật ngữ nước ngoài khi cần thiết"
        },
        "english": {
            "instruction": "Create summary ENTIRELY in English",
            "tone": "Use natural, professional English tone",
            "terminology": "Use appropriate English terminology and expressions"
        },
        "japanese": {
            "instruction": "Create summary ENTIRELY in Japanese",
            "tone": "Use natural, professional Japanese tone",
            "terminology": "Use appropriate Japanese terminology and expressions"
        },
        "auto": {
            "instruction": "ALWAYS generate summaries in the EXACT same language as the source content",
            "tone": "Match the linguistic style and tone of the original content",
            "terminology": "Preserve terminology conventions from the source language"
        }
    }

    target_settings = {
        "study": {
            "focus": "Organize content for learning and retention",
            "structure": "Use educational format with clear learning objectives",
            "extras": "Include key concepts, definitions, and examples for better understanding"
        },
        "work": {
            "focus": "Extract actionable insights and key business information",
            "structure": "Use professional format suitable for workplace communication",
            "extras": "Highlight decisions, recommendations, and next steps"
        },
        "research": {
            "focus": "Preserve academic rigor and detailed analysis",
            "structure": "Maintain scholarly structure with proper categorization",
            "extras": "Include methodology, findings, and implications"
        },
        "presentation": {
            "focus": "Create content suitable for oral presentation",
            "structure": "Use clear, scannable format with strong visual hierarchy",
            "extras": "Emphasize key talking points and memorable insights"
        },
        "quick_reference": {
            "focus": "Create easily scannable reference material",
            "structure": "Use concise format with clear categorization",
            "extras": "Focus on facts, figures, and quick lookup information"
        },
        "general": {
            "focus": "Provide balanced comprehensive overview",
            "structure": "Use standard structure suitable for general consumption",
            "extras": "Include all major aspects without specific bias"
        }
    }

    detail_config = detail_settings.get(mindmap_detailed_level.lower(), detail_settings["moderate"])
    language_config = language_settings.get(mindmap_language.lower(), language_settings["auto"])
    target_config = target_settings.get(mindmap_target.lower(), target_settings["general"])

    system_prompt = f"""
🎯 Your task is to analyze the input text and convert it into a JSON-based mindmap with a clear parent-child tree structure.

✅ Requirements:
1. Automatically detect the language of the input (English, Vietnamese or Japanese).
2. Return a nested JSON object.
3. Each key should be the title or content of a branch in the mindmap.
4. If a branch has children, it must contain a nested object representing its sub-branches.
5. If the branch is a leaf node (no children), it must contain a string description instead of another object.
6. Do NOT include any explanations, markdown, or extra text outside the JSON.

📚 User Settings:
- Target: {target_config['focus']}
- Structure Style: {target_config['structure']}
- Extra Notes: {target_config['extras']}
- Detail: {detail_config['focus']} | Length: {detail_config['length']}
- Language: {language_config['instruction']}, {language_config['tone']}

Expected JSON format:

{{
  "Artificial Intelligence": {{
    "Machine Learning": {{
      "Supervised Learning": {{
        "Classification": "Use labeled data to predict categories",
        "Regression": "Giải thích về RMSprop, Adam, và tối ưu hóa mạng neural..."
      }},
      "Unsupervised Learning": {{
        "Clustering": "Group data points based on similarity",
        "Dimensionality Reduction": "Reduce feature space while preserving information"
      }}
    }}
  }}
}}
Below is the input content:

\"\"\"{content}\"\"\"

Return only valid JSON. No additional explanation is needed.
"""

    return system_prompt


class CustomMindmap:
    def __init__(self, model_name: str = "gemini-2.5-pro"):
        self.model = genai.GenerativeModel(model_name)

    def createCustomMindmap(
        self,
        content: str,
        mindmap_target: str,
        mindmap_language: str,
        mindmap_detailed_level: str,
        stream: bool = True
    ) -> str:

        system_prompt = generate_dynamic_system_prompt(
            content,
            mindmap_target,
            mindmap_language,
            mindmap_detailed_level
        )

        full_prompt = system_prompt

        response = ""
        if stream:
            in_think_block = False
            for chunk in self.model.generate_content(full_prompt, stream=True):
                if chunk.text:
                    part = chunk.text

                    # Remove think blocks if any
                    if "<think>" in part:
                        in_think_block = True
                        part = part.split("<think>")[0]

                    if "</think>" in part:
                        in_think_block = False
                        part = part.split("</think>")[-1]

                    if not in_think_block and part.strip():
                        response += part
        else:
            response = self.model.generate_content(full_prompt).text
            response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)

        return response.strip()
