![Alt text](https://github.com/MinhHung7/Docwhiz/raw/main/images/Screenshot%202025-08-05%20101801.png)

# 📄 DocWhiz – AI-Powered PDF Assistant
DocWhiz is an intelligent chatbot powered by Retrieval-Augmented Generation (RAG), designed to help users interact with PDF documents more effectively. Whether you're asking questions, summarizing content, creating custom notes, or visualizing ideas through mindmaps — DocWhiz transforms static PDFs into dynamic and personalized learning tools.

## 💡 Inspiration
While using Google NotebookLM, I noticed a few key limitations that inspired the creation of DocWhiz:
- **Hallucination Issues**: In some cases, NotebookLM responded with content that wasn’t in the uploaded document. For example, I uploaded a 30-page excerpt from a Vietnamese grade 5 textbook, but the generated summary omitted those specific pages — indicating that the model might have relied too heavily on its training data instead of the actual input file.
- **Lack of Customization**: The generated notes and mindmaps had a rigid structure — users couldn’t edit or personalize them to fit their own thinking or learning style.

These challenges highlighted the need for a more accurate, document-grounded assistant that also offers flexibility in note-taking and visualization. That’s how DocWhiz was born — a tool that:
- Answers your questions only based on the content you upload
- Lets you fully customize notes and mindmaps to match your style
- Supports manual editing if you want to tweak the results

## ⚠️ Project Status
- Note: DocWhiz is currently under active development and not yet deployed online.
You can run it locally for testing and experimentation.

## 🖼️ Demo Screenshots
1. Chatbot Q&A from PDF
Ask natural language questions about your PDFs. DocWhiz uses Retrieval-Augmented Generation (RAG) to deliver accurate, grounded answers.
![Alt text](https://github.com/MinhHung7/Docwhiz/blob/main/images/Screenshot%202025-08-05%20102942.png)

3. Edit Custom Note
Create and freely edit your personalized notes based on the document.
![Alt text](https://github.com/MinhHung7/Docwhiz/blob/main/images/Screenshot%202025-08-05%20103321.png)

4. View Generated Note
Preview your auto-generated note with a clean and readable layout.
![Alt text](https://github.com/MinhHung7/Docwhiz/blob/main/images/Screenshot%202025-08-05%20103530.png)

5. Interactive Mindmap
Visualize the document's structure or summary with customizable mindmaps.
![Alt text](https://github.com/MinhHung7/Docwhiz/blob/main/images/Screenshot%202025-08-05%20103819.png)

## 📦 Tech Stack
Frontend: React, d3 framework  
Backend: Python, FastAPI  
Vector Store: Weaviate, ChromaDB  
LLM & Embeddings: Gemini / JIRA / Together / Groq  
Storage: Supabase  

## 🛠️ Getting Started
```bash
# Clone the repo
git clone https://github.com/MinhHung7/Docwhiz.git
cd docwhiz

# Install dependencies
# for backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# or for frontend
npm install
npm start

# Run backend and frontend separately
```




