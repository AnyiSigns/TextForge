import asyncio
import sys
import traceback
sys.path.insert(0, r"C:\Users\Anyi\Documents\PycharmProjects\TextForge")

try:
    from sqlalchemy.ext.asyncio import create_async_engine
    from text_forge_backend.config.settings import settings
    print("POSTGRES_DB_URL:", settings.POSTGRES_DB_URL)
    
    async def check():
        engine = create_async_engine(settings.POSTGRES_DB_URL, echo=True)
        try:
            async with engine.connect() as conn:
                result = await conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'chapters' ORDER BY ordinal_position")
                rows = result.fetchall()
                print("Columns:", [r[0] for r in rows])
        except Exception as e:
            print("Error:", e)
            traceback.print_exc()
        finally:
            await engine.dispose()

    asyncio.run(check())
except Exception as e:
    print("Top level error:", e)
    traceback.print_exc()
