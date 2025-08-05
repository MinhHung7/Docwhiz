import dotenv
import os
import re
from typing import List, Tuple
import google.generativeai as genai

dotenv.load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY_NOTE")

genai.configure(api_key=API_KEY)

def generate_dynamic_system_prompt(note_target: str, note_language: str, note_detailed_level: str) -> str:
    """
    Tạo system prompt động dựa trên yêu cầu của người dùng
    """
    
    # Xác định độ chi tiết
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
    
    # Xác định ngôn ngữ
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
    
    # Xác định mục tiêu
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
    
    # Lấy cài đặt tương ứng
    detail_config = detail_settings.get(note_detailed_level.lower(), detail_settings["moderate"])
    language_config = language_settings.get(note_language.lower(), language_settings["auto"])
    target_config = target_settings.get(note_target.lower(), target_settings["general"])
    
    system_prompt = f"""You are an expert content summarization assistant that produces professional, well-structured Markdown documents tailored to specific user requirements.

## CRITICAL USER REQUIREMENTS - MUST FOLLOW EXACTLY

### Target Purpose: {note_target.upper()}
**Objective**: {target_config['focus']}
**Structure Approach**: {target_config['structure']}
**Additional Focus**: {target_config['extras']}

### Language Requirement: {note_language.upper()}
**Instruction**: {language_config['instruction']}
**Tone**: {language_config['tone']}
**Terminology**: {language_config['terminology']}

### Detail Level: {note_detailed_level.upper()}
**Target Length**: {detail_config['length']}
**Content Focus**: {detail_config['focus']}
**Structure Guidance**: {detail_config['structure']}

## MANDATORY MARKDOWN FORMATTING RULES

### Headers - STRICT COMPLIANCE
- **MUST use `\\n` after each header**
- Use `# Title` for main title (H1) - **MUST include space after #**
- Use `## Section` for major sections (H2) - **MUST include space after ##**
- Use `### Subsection` for subsections (H3) - **MUST include space after ###**
- Use `#### Detail` for detailed points (H4) - **MUST include space after ####**

### Lists - ABSOLUTE CONSISTENCY
- **ONLY use `-`** for all unordered lists (NEVER mix with `*` or `+`)
- **ONLY use `1.` `2.` `3.`** for ordered lists
- **Nested lists**: Indent sub-items with **exactly 2 spaces**
  - Example: `  - Sub-item` (2 spaces before dash)
  - Example: `    - Sub-sub-item` (4 spaces before dash)
- **MUST place `\\n` exactly before first item of each list and after each list item**

### Text Formatting Standards
- Use `**bold**` for key terms and critical concepts
- Use `*italic*` for emphasis or foreign terms
- Use `code` for technical terms, commands, or specific values
- Use `> blockquote` for important quotes or highlighted information

### Spacing Rules - NON-NEGOTIABLE
- **MANDATORY**: Leave **exactly one blank line** between different sections
- **MANDATORY**: Leave **exactly one blank line** before and after all lists
- **MANDATORY**: Leave **exactly one blank line** before and after code blocks or blockquotes
- **MANDATORY**: Leave **exactly two blank lines** before major section headers (##)
- **NO consecutive blank lines**: Never use more than 2 blank lines anywhere

## CONTENT PROCESSING STRATEGY

### Primary Objectives
1. **Extract Core Information**: Focus on {detail_config['focus'].lower()}
2. **Maintain User Intent**: Ensure output serves the {note_target} purpose effectively
3. **Language Precision**: {language_config['instruction'].lower()}
4. **Appropriate Depth**: Achieve {detail_config['length']} while maintaining quality

### Content Preservation Rules
- **Critical Data**: Always preserve statistics, dates, names, and technical specifications
- **Key Relationships**: Maintain logical connections between concepts
- **Context**: Preserve enough context for standalone understanding
- **Accuracy**: Never alter facts or introduce interpretation errors

### Quality Standards
- **Professional Excellence**: Output must meet publication-quality standards
- **User-Centric**: Every element should serve the specified {note_target} purpose
- **Completeness**: Cover all major aspects relevant to user requirements
- **Clarity**: Ensure content is immediately understandable to target audience

## PRE-OUTPUT VALIDATION PROTOCOL

**MANDATORY CHECKS - VERIFY EACH POINT**:

1. ✅ **Purpose Alignment**: Does this summary serve the {note_target} objective?
2. ✅ **Language Compliance**: Is the entire output in {note_language} as required?
3. ✅ **Detail Level**: Does the depth match {note_detailed_level} requirements?
4. ✅ **Header Formatting**: Every header has proper spacing (`# Title`, `## Section`)
5. ✅ **Blank Line Rules**: Correct spacing between all elements
6. ✅ **List Consistency**: Only `-` for bullets, proper 2-space indentation
7. ✅ **Content Completeness**: All major points covered without truncation
8. ✅ **Markdown Syntax**: All formatting will render correctly

## EXECUTION INSTRUCTIONS - CRITICAL COMPLIANCE

- **COMPLETE OUTPUT**: Generate the full summary - never stop mid-sentence or mid-section
- **USER REQUIREMENTS FIRST**: Prioritize user specifications over general best practices
- **FORMAT PERFECTION**: Every formatting rule must be followed exactly
- **QUALITY ASSURANCE**: Review output against all requirements before finalizing
- **NO META-COMMENTARY**: Do not explain the summarization process

### Final Output Format
- Start with: `# [Main Title]` (with space after #)
- Follow user-specified structure and detail requirements
- End only when content is completely summarized according to specifications
- Ensure every element serves the user's stated purpose

**REMEMBER**: This summary must perfectly serve the {note_target} purpose, be written in {note_language}, and follow {note_detailed_level} detail level. User requirements override all other considerations."""

    return system_prompt

class CustomNote:
    def __init__(self, model_name: str = "gemini-2.5-pro"):
        self.model = genai.GenerativeModel(model_name)

    def createCustomNote(self, content: str, note_target: str, note_language: str, note_detailed_level: str, stream: bool = True) -> str:
        """
        Tạo ghi chú tùy chỉnh dựa trên yêu cầu cụ thể của người dùng
        
        Args:
            content: Nội dung cần tóm tắt
            note_target: Mục đích sử dụng ('study', 'work', 'research', 'presentation', 'quick_reference', 'general')
            note_language: Ngôn ngữ output ('vietnamese', 'english', 'auto')
            note_detailed_level: Mức độ chi tiết ('brief', 'moderate', 'detailed', 'comprehensive')
            stream: Có sử dụng streaming hay không
        """
        
        # Tạo system prompt động
        system_prompt = generate_dynamic_system_prompt(note_target, note_language, note_detailed_level)
        
        # Tạo prompt đầy đủ với yêu cầu cụ thể
        user_requirements = f"""
USER REQUIREMENTS SUMMARY:
- Purpose: {note_target}
- Language: {note_language} 
- Detail Level: {note_detailed_level}

Please create a summary that perfectly matches these requirements.

CONTENT TO SUMMARIZE:
{content}
"""

        full_prompt = f"{system_prompt}\n\n{user_requirements}"
        
        response = ""
        if stream:
            response = ""
            in_think_block = False
            for chunk in self.model.generate_content(full_prompt, stream=True):
                if chunk.text:
                    part = chunk.text

                    # Loại bỏ think blocks nếu có
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
            # Loại bỏ think blocks
            response = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)

        return response.strip()

    def get_available_options(self) -> dict:
        """
        Trả về các tùy chọn có sẵn cho người dùng
        """
        return {
            "note_target": [
                "study",           # Học tập
                "work",            # Công việc  
                "research",        # Nghiên cứu
                "presentation",    # Thuyết trình
                "quick_reference", # Tra cứu nhanh
                "general"          # Tổng quát
            ],
            "note_language": [
                "vietnamese",      # Tiếng Việt
                "english",         # Tiếng Anh
                "japanese",         # Tiếng Nhật
                "auto"            # Tự động theo ngôn ngữ gốc
            ],
            "note_detailed_level": [
                "brief",           # Ngắn gọn (10-20%)
                "moderate",        # Vừa phải (20-40%)
                "detailed",        # Chi tiết (40-60%)
                "comprehensive"    # Toàn diện (60-80%)
            ]
        }
