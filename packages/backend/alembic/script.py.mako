"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision}
Branch Labels: ${branch_labels}
Depends on: ${depends_on}
"""
from typing import Union
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

def upgrade() -> Union[None, str]:
    ${up_body if up_body else "pass"}

def downgrade() -> Union[None, str]:
    ${down_body if down_body else "pass"}
