from PyPDF2 import PdfReader
from pdf2image import convert_from_path
import google.generativeai as genai
import re
import subprocess
import fitz
from PIL import Image
import io
import base64
from io import BytesIO
from langchain.schema import Document
from langchain.text_splitter import TokenTextSplitter
import dotenv
import os
import tempfile
import easyocr
import numpy as np
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from multiprocessing import cpu_count
import threading
from functools import partial

dotenv.load_dotenv()

CHUNKSIZE = 2000
CHUNKOVERLAP = 100
MAX_WORKERS = min(4, cpu_count())  # Giới hạn số worker để tránh quá tải

def is_scanned_PDF(file_bytes: bytes, threshold=50):
    reader = PdfReader(io.BytesIO(file_bytes))
    total_chars = 0
    for page in reader.pages:
        text = page.extract_text()
        if text:
            total_chars += len(text)
    return total_chars < threshold

def extract_text_from_image_batch(images_batch, batch_id):
    """Xử lý một batch các images với Gemini API để extract text"""
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel('gemini-2.0-flash-exp')
    
    prompt = """
Extract all text content from this document image.

Rules:
- Extract text exactly as it appears in the image
- Preserve the original structure and formatting as much as possible
- Include headings, paragraphs, lists, and table content
- If text is unclear or partially visible, mark as [unclear text]
- Do not add any commentary or explanations
- Return only the extracted text content

Extract the text:
""".strip()

    results = []
    for idx, image in enumerate(images_batch):
        try:
            print(f"Processing batch {batch_id}, image {idx + 1}/{len(images_batch)}")
            image = image.convert("RGB")
            response = model.generate_content([prompt, image])
            results.append((batch_id * len(images_batch) + idx, response.text))
        except Exception as e:
            print(f"Error processing image {idx} in batch {batch_id}: {e}")
            results.append((batch_id * len(images_batch) + idx, ""))
    
    return results

def extract_text_from_images_parallel(images, batch_size=4):
    """Xử lý nhiều images song song với batching để tránh rate limiting"""
    print(f"Processing {len(images)} images with batch size {batch_size}...")
    
    # Chia images thành các batch nhỏ
    batches = []
    for i in range(0, len(images), batch_size):
        batches.append(images[i:i + batch_size])
    
    text_results = [None] * len(images)
    
    # Sử dụng ThreadPoolExecutor với số lượng worker hạn chế
    with ThreadPoolExecutor(max_workers=min(2, len(batches))) as executor:
        future_to_batch = {
            executor.submit(extract_text_from_image_batch, batch, batch_id): batch_id
            for batch_id, batch in enumerate(batches)
        }
        
        for future in as_completed(future_to_batch):
            batch_results = future.result()
            for page_idx, text_content in batch_results:
                text_results[page_idx] = text_content
    
    return text_results

def convert_pdf_to_images_parallel(file_bytes: bytes, dpi=300):
    """Convert PDF to images với xử lý song song"""
    print("Converting PDF to images...")
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    print(f"PDF opened with {doc.page_count} pages.")
    
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    
    def process_page(page_num):
        """Xử lý một trang PDF"""
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat)
        image = Image.open(io.BytesIO(pix.tobytes("png")))
        return page_num, image
    
    images = [None] * doc.page_count
    
    # Sử dụng ThreadPoolExecutor cho I/O bound operations
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_page = {
            executor.submit(process_page, page_num): page_num 
            for page_num in range(doc.page_count)
        }
        
        for future in as_completed(future_to_page):
            page_num, image = future.result()
            images[page_num] = image
            print(f"Processed page {page_num + 1}/{doc.page_count}")
    
    doc.close()
    return images

def process_page_ocr(page_data):
    """Xử lý OCR cho một trang"""
    page_num, img_bytes = page_data
    reader = easyocr.Reader(['vi', 'en'], gpu=False, verbose=False)
    
    try:
        img = Image.open(io.BytesIO(img_bytes))
        img_array = np.array(img)
        results = reader.readtext(img_array, detail=0, paragraph=True)
        text = '\n'.join(results)
        return page_num, text
    except Exception as e:
        print(f"Error processing page {page_num}: {e}")
        return page_num, ""

def image_to_text_parallel(file_bytes):
    """OCR song song cho PDF scanned"""
    print("Starting parallel OCR processing...")
    pdf_doc = fitz.open("pdf", file_bytes)
    
    # Chuẩn bị dữ liệu cho tất cả các trang
    page_data = []
    for page_num in range(pdf_doc.page_count):
        page = pdf_doc[page_num]
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
        img_bytes = pix.tobytes("png")
        page_data.append((page_num, img_bytes))
    
    pdf_doc.close()
    
    # Xử lý song song với ProcessPoolExecutor (CPU-bound)
    text_results = [None] * len(page_data)
    
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_page = {
            executor.submit(process_page_ocr, data): data[0]
            for data in page_data
        }
        
        for future in as_completed(future_to_page):
            page_num = future_to_page[future]
            try:
                page_num, text = future.result()
                text_results[page_num] = text
                print(f"OCR completed for page {page_num + 1}/{len(page_data)}")
            except Exception as e:
                print(f"Error processing page {page_num}: {e}")
                text_results[page_num] = ""
    
    # Kết hợp kết quả
    full_text = ""
    for text in text_results:
        full_text += f"\n\n{text}\n"
    
    return full_text

def pdf_to_text(file_bytes: bytes):
    """Extract text from PDF using PyPDF2"""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n\n"
        return text
    except Exception as e:
        print(f"Error extracting text with PyPDF2: {e}")
        return ""

def clean_text(text):
    """Clean extracted text"""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Remove common page break markers
    text = re.sub(r'^[\-=_]{3,}$', '', text, flags=re.MULTILINE)
    
    # Clean up line breaks and spacing
    text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces to single space
    text = re.sub(r'^\s+|\s+$', '', text, flags=re.MULTILINE)  # Trim lines
    
    # Remove empty lines at start and end
    text = text.strip()
    
    return text

def split_text_parallel(text, chunk_size=CHUNKSIZE, chunk_overlap=CHUNKOVERLAP):
    """Chia text thành chunks song song"""
    text_splitter = TokenTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    
    # Chia text thành các phần nhỏ hơn để xử lý song song
    text_parts = [text[i:i+50000] for i in range(0, len(text), 45000)]  # Overlap 5000 chars
    
    all_chunks = []
    
    def process_text_part(part_data):
        part_idx, part_text = part_data
        chunks = text_splitter.split_text(part_text)
        return [(part_idx, chunk) for chunk in chunks]
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [
            executor.submit(process_text_part, (idx, part))
            for idx, part in enumerate(text_parts)
        ]
        
        for future in as_completed(futures):
            chunks = future.result()
            all_chunks.extend(chunks)
    
    # Sắp xếp lại theo thứ tự
    all_chunks.sort(key=lambda x: x[0])
    return [chunk[1] for chunk in all_chunks]

class ParallelLoader:
    def __init__(self, file_content: bytes, max_workers=None):
        self.file_content = file_content
        self.max_workers = max_workers or MAX_WORKERS
    
    def load_chunks(self):
        text_content = ""
        
        print(f"Using {self.max_workers} workers for parallel processing")

        if is_scanned_PDF(self.file_content):
            print("Scanned PDF detected - using parallel OCR processing")
            text_content = image_to_text_parallel(self.file_content)
        else:
            print("PDF is not scanned - extracting text directly")
            text_content = pdf_to_text(self.file_content)
        
        print("Cleaning text...")
        cleaned_text = clean_text(text_content)
        
        if not cleaned_text.strip():
            print("Warning: No text extracted from PDF")
            return []
        
        print("Splitting text into chunks...")
        text_chunks = split_text_parallel(cleaned_text)
        
        document_chunks = [
            Document(page_content=chunk, metadata={"source": "uploaded_file", "chunk_id": idx})
            for idx, chunk in enumerate(text_chunks)
        ]
        
        print(f"Generated {len(document_chunks)} chunks")
        return document_chunks

# Alternative method using Gemini for scanned PDFs (more accurate but slower)
class ParallelLoaderWithGemini:
    def __init__(self, file_content: bytes, max_workers=None):
        self.file_content = file_content
        self.max_workers = max_workers or MAX_WORKERS
    
    def load_chunks(self):
        text_content = ""
        
        print(f"Using {self.max_workers} workers for parallel processing")

        if is_scanned_PDF(self.file_content):
            print("Scanned PDF detected - using Gemini for text extraction")
            images = convert_pdf_to_images_parallel(self.file_content)
            text_results = extract_text_from_images_parallel(images)
            text_content = "\n\n".join(text_results)
        else:
            print("PDF is not scanned - extracting text directly")
            text_content = pdf_to_text(self.file_content)
        
        print("Cleaning text...")
        cleaned_text = clean_text(text_content)
        
        if not cleaned_text.strip():
            print("Warning: No text extracted from PDF")
            return []
        
        print("Splitting text into chunks...")
        text_chunks = split_text_parallel(cleaned_text)
        
        document_chunks = [
            Document(page_content=chunk, metadata={"source": "uploaded_file", "chunk_id": idx})
            for idx, chunk in enumerate(text_chunks)
        ]
        
        print(f"Generated {len(document_chunks)} chunks")
        return document_chunks

# Usage examples:
# For faster processing with EasyOCR:
# loader = ParallelLoader(file_content, max_workers=4)
# chunks = loader.load_chunks()

# For more accurate processing with Gemini (slower):
# loader = ParallelLoaderWithGemini(file_content, max_workers=4)
# chunks = loader.load_chunks()