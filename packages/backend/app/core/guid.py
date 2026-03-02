import uuid
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as pgUUID

class GUID(TypeDecorator):
    """
    基于平台自动选择的 GUID 类型。
    在 PostgreSQL 上使用原生 UUID，在其他（如 SQLite）上使用 CHAR(32)。
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(pgUUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        
        # 统一转为无连字符的 hex 字符串
        if isinstance(value, uuid.UUID):
            return value.hex
        
        try:
            return uuid.UUID(str(value)).hex
        except (ValueError, TypeError):
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        
        if isinstance(value, uuid.UUID):
            return value
            
        try:
            # 应对 SQLite 返回 int, bytes 或带/不带连字符的 string
            if isinstance(value, int):
                # 应对可能的溢出或特殊存储
                return uuid.UUID(int=value)
            
            # 尝试最通用的解析
            s_val = str(value).replace('-', '')
            if len(s_val) == 32:
                return uuid.UUID(hex=s_val)
            
            return uuid.UUID(s_val)
        except (ValueError, TypeError, AttributeError):
            # 最后的防线：如果真的没法解析（比如是脏数据），返回 None 而不是崩溃
            return None
