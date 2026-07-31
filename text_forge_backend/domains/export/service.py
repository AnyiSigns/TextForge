from typing import List, Optional, Dict, Any
from io import BytesIO
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models.book import Book, Volume, Chapter, ChapterContent, Character, Outline
from config.logging import get_logger

logger = get_logger(__name__)


class ExportService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def export_book(
        self,
        user_id: int,
        book_id: int,
        fmt: str,
        include_outline: bool,
        include_characters: bool,
        volume_ids: Optional[List[int]],
    ) -> Dict[str, Any]:
        stmt = select(Book).where(Book.user_id == user_id, Book.id == book_id)
        result = await self.session.execute(stmt)
        book = result.scalar_one_or_none()
        if not book:
            return None

        volumes_stmt = select(Volume).where(Volume.book_id == book_id)
        if volume_ids:
            volumes_stmt = volumes_stmt.where(Volume.id.in_(volume_ids))
        volumes_stmt = volumes_stmt.order_by(Volume.sort_order)
        volumes_result = await self.session.execute(volumes_stmt)
        volumes = volumes_result.scalars().all()

        chapters = []
        for volume in volumes:
            chapters_stmt = (
                select(Chapter)
                .where(Chapter.volume_id == volume.id)
                .order_by(Chapter.sort_order)
            )
            chapters_result = await self.session.execute(chapters_stmt)
            volume_chapters = chapters_result.scalars().all()
            for chapter in volume_chapters:
                content_stmt = (
                    select(ChapterContent)
                    .where(ChapterContent.chapter_id == chapter.id)
                    .order_by(ChapterContent.version.desc())
                    .limit(1)
                )
                content_result = await self.session.execute(content_stmt)
                latest = content_result.scalar_one_or_none()
                chapters.append(
                    {
                        "volume_title": volume.title,
                        "chapter_title": chapter.title,
                        "content": latest.content if latest else "",
                    }
                )

        characters = []
        if include_characters:
            chars_stmt = (
                select(Character)
                .where(Character.book_id == book_id)
                .order_by(Character.id)
            )
            chars_result = await self.session.execute(chars_stmt)
            characters = [
                {
                    "name": c.name,
                    "description": c.description or "",
                    "role_type": c.role_type or "",
                }
                for c in chars_result.scalars().all()
            ]

        outline = []
        if include_outline:
            outline_stmt = (
                select(Outline)
                .where(Outline.book_id == book_id)
                .order_by(Outline.sort_order)
            )
            outline_result = await self.session.execute(outline_stmt)
            outline = [
                {"title": o.title, "content": o.content or "", "node_type": o.node_type}
                for o in outline_result.scalars().all()
            ]

        if fmt == "md":
            return self._build_markdown(book, chapters, characters, outline)
        if fmt == "txt":
            return self._build_txt(book, chapters, characters, outline)
        if fmt == "epub":
            return await self._build_epub(book, chapters, characters, outline)
        if fmt == "pdf":
            return await self._build_pdf(book, chapters, characters, outline)
        return None

    def _build_markdown(self, book, chapters, characters, outline):
        lines = [f"# {book.title}", ""]
        if book.description:
            lines.extend([book.description, ""])
        if outline:
            lines.extend(["## 大纲", ""])
            for item in outline:
                lines.append(f"- {item['title']}")
                if item.get("content"):
                    lines.append(f"  {item['content']}")
            lines.append("")
        if characters:
            lines.extend(["## 角色", ""])
            for c in characters:
                lines.append(f"### {c['name']}")
                if c.get("role_type"):
                    lines.append(f"类型: {c['role_type']}")
                if c.get("description"):
                    lines.extend(["", c["description"], ""])
        current_volume = None
        for ch in chapters:
            if ch["volume_title"] != current_volume:
                current_volume = ch["volume_title"]
                lines.extend([f"## {current_volume}", ""])
            lines.extend([f"### {ch['chapter_title']}", ""])
            if ch.get("content"):
                lines.extend([ch["content"], ""])
        return {
            "format": "md",
            "file_name": f"{book.title}.md",
            "content": "\n".join(lines),
        }

    def _build_txt(self, book, chapters, characters, outline):
        lines = [book.title, "=" * len(book.title), ""]
        if book.description:
            lines.extend([book.description, ""])
        if outline:
            lines.extend(["大纲", "-" * 10, ""])
            for item in outline:
                lines.append(f"- {item['title']}")
                if item.get("content"):
                    lines.append(f"  {item['content']}")
            lines.append("")
        if characters:
            lines.extend(["角色", "-" * 10, ""])
            for c in characters:
                lines.append(f"{c['name']} ({c.get('role_type','')})")
                if c.get("description"):
                    lines.extend(["", c["description"], ""])
        current_volume = None
        for ch in chapters:
            if ch["volume_title"] != current_volume:
                current_volume = ch["volume_title"]
                lines.extend([current_volume, "-" * len(current_volume), ""])
            lines.extend([ch["chapter_title"], ""])
            if ch.get("content"):
                lines.extend([ch["content"], ""])
        return {
            "format": "txt",
            "file_name": f"{book.title}.txt",
            "content": "\n".join(lines),
        }

    async def _build_epub(self, book, chapters, characters, outline):
        from ebooklib import epub
        from ebooklib.utils import debug

        epub_book = epub.EpubBook()
        epub_book.set_identifier(str(book.id))
        epub_book.set_title(book.title)
        epub_book.set_language("zh")
        epub_book.add_author("TextForge")

        toc_items = []
        spine = ["nav"]

        if outline:
            outline_ch = epub.EpubHtml(title="大纲", file_name="outline.xhtml")
            outline_lines = ["<h1>大纲</h1>", "<ul>"]
            for item in outline:
                outline_lines.append(f"<li>{item['title']}</li>")
                if item.get("content"):
                    outline_lines.append(f"<li>{item['content']}</li>")
            outline_lines.append("</ul>")
            outline_ch.content = "\n".join(outline_lines)
            epub_book.add_item(outline_ch)
            toc_items.append(outline_ch)
            spine.append(outline_ch)

        if characters:
            char_ch = epub.EpubHtml(title="角色", file_name="characters.xhtml")
            char_lines = ["<h1>角色</h1>"]
            for c in characters:
                char_lines.append(f"<h2>{c['name']}</h2>")
                if c.get("role_type"):
                    char_lines.append(f"<p>类型: {c['role_type']}</p>")
                if c.get("description"):
                    char_lines.append(f"<p>{c['description']}</p>")
            char_ch.content = "\n".join(char_lines)
            epub_book.add_item(char_ch)
            toc_items.append(char_ch)
            spine.append(char_ch)

        current_volume = None
        volume_ch = None
        for idx, ch in enumerate(chapters):
            if ch["volume_title"] != current_volume:
                current_volume = ch["volume_title"]
                volume_ch = epub.EpubHtml(
                    title=current_volume, file_name=f"volume_{idx}.xhtml"
                )
                volume_lines = [f"<h1>{current_volume}</h1>"]
                volume_ch.content = "\n".join(volume_lines)
                epub_book.add_item(volume_ch)
                toc_items.append(volume_ch)
                spine.append(volume_ch)
            chapter_ch = epub.EpubHtml(
                title=ch["chapter_title"], file_name=f"chapter_{idx}.xhtml"
            )
            chapter_lines = [f"<h2>{ch['chapter_title']}</h2>"]
            if ch.get("content"):
                chapter_lines.append(
                    f"<p>{ch['content'].replace(chr(10), '</p><p>')}</p>"
                )
            chapter_ch.content = "\n".join(chapter_lines)
            epub_book.add_item(chapter_ch)
            toc_items.append(chapter_ch)
            spine.append(chapter_ch)

        epub_book.toc = toc_items
        epub_book.add_item(epub.EpubNcx())
        epub_book.add_item(epub.EpubNav())
        epub_book.spine = spine

        buffer = BytesIO()
        epub.write_epub(buffer, epub_book)
        buffer.seek(0)
        return {
            "format": "epub",
            "file_name": f"{book.title}.epub",
            "content": buffer.getvalue(),
        }

    async def _build_pdf(self, book, chapters, characters, outline):
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph(book.title, styles["Title"]))
        story.append(Spacer(1, 0.5 * cm))
        if book.description:
            story.append(Paragraph(book.description, styles["Normal"]))
            story.append(Spacer(1, 0.3 * cm))

        if outline:
            story.append(Paragraph("大纲", styles["Heading2"]))
            for item in outline:
                story.append(Paragraph(f"- {item['title']}", styles["Normal"]))
                if item.get("content"):
                    story.append(Paragraph(f"  {item['content']}", styles["Normal"]))
            story.append(Spacer(1, 0.3 * cm))

        if characters:
            story.append(Paragraph("角色", styles["Heading2"]))
            for c in characters:
                story.append(
                    Paragraph(
                        f"{c['name']} ({c.get('role_type','')})", styles["Heading3"]
                    )
                )
                if c.get("description"):
                    story.append(Paragraph(c["description"], styles["Normal"]))
            story.append(Spacer(1, 0.3 * cm))

        current_volume = None
        for ch in chapters:
            if ch["volume_title"] != current_volume:
                current_volume = ch["volume_title"]
                story.append(Paragraph(current_volume, styles["Heading2"]))
            story.append(Paragraph(ch["chapter_title"], styles["Heading3"]))
            if ch.get("content"):
                for para in ch["content"].split("\n\n"):
                    story.append(
                        Paragraph(para.replace("\n", "<br/>"), styles["Normal"])
                    )
            story.append(Spacer(1, 0.3 * cm))

        doc.build(story)
        buffer.seek(0)
        return {
            "format": "pdf",
            "file_name": f"{book.title}.pdf",
            "content": buffer.getvalue(),
        }
