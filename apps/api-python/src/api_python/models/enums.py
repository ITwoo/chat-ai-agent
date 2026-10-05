from enum import Enum


class BoardStatus(str, Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"


class ChatMessageRole(str, Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"


class ChatMessageStatus(str, Enum):
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class RagDocumentStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class UserMemoryType(str, Enum):
    PROFILE = "PROFILE"
    PREFERENCE = "PREFERENCE"
    GOAL = "GOAL"
    CONSTRAINT = "CONSTRAINT"


class UserMemoryStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    DELETED = "DELETED"


class UserMemoryExtractionStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"