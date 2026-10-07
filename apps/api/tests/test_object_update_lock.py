import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers import objects as objects_router
from app.schemas.objects import ObjectUpdate


class _Result:
    def scalar_one_or_none(self):
        return None


class _Db:
    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _Result()


class _Ctx:
    def __init__(self):
        self.workspace = type("Workspace", (), {"id": uuid4()})()
        self.org_id = uuid4()
        self.user_id = uuid4()

    async def require_permission(self, db, permission):
        return None


def test_update_object_locks_the_row_before_merging_properties():
    db = _Db()
    ctx = _Ctx()
    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            objects_router.update_object(
                uuid4(),
                ObjectUpdate(properties={"job": "sales_assist"}),
                ctx=ctx,
                db=db,
            )
        )
    assert caught.value.status_code == 404
    assert db.statements[0]._for_update_arg is not None, (
        "the object SELECT in update_object must use with_for_update()"
    )
