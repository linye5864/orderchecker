"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision}
Create Date: ${create_date}

"""
from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision = '${up_revision}'
down_revision = ${down_revision}
branch_labels = ${branch_labels}
depends_on = ${depends_on}


def upgrade() -> None:
    """Upgrade to a newer revision."""
    # 创建自定义类型
    op.execute("CREATE TYPE IF NOT EXISTS user_role AS ENUM ('admin', 'operator', 'viewer')")
    op.execute("CREATE TYPE IF NOT EXISTS task_status AS ENUM ('INIT', 'UPLOADED', 'PARSING', 'NORMALIZING', 'MATCHING', 'AGGREGATING', 'FINISHED', 'FAILED')")
    op.execute("CREATE TYPE IF NOT EXISTS result_status AS ENUM ('MATCHED', 'EXCEPTION', 'MISSING')")
    op.execute("CREATE TYPE IF NOT EXISTS file_type AS ENUM ('delivery', 'platform', 'flow')")
    
    # 创建 users 表
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('username', sa.String(50), nullable=False, unique=True),
        sa.Column('email', sa.String(100), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'operator', 'viewer', name='user_role'), nullable=False, default='viewer'),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('created_at', sa.DateTime, nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    
    # 创建 uploaded_files 表
    op.create_table(
        'uploaded_files',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('original_filename', sa.String(500), nullable=False),
        sa.Column('stored_filename', sa.String(500), nullable=False),
        sa.Column('file_path', sa.String(1000), nullable=False),
        sa.Column('file_size', sa.BigInteger, nullable=False),
        sa.Column('file_type', sa.Enum('delivery', 'platform', 'flow', name='file_type'), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=True, default='application/octet-stream'),
        sa.Column('is_processed', sa.Integer, nullable=False, default=0),
        sa.Column('parse_error', sa.String(1000), nullable=True),
        sa.Column('parse_result', sa.String, nullable=True),
        sa.Column('uploaded_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_uploaded_files_file_type', 'uploaded_files', ['file_type'], unique=False)
    op.create_index('ix_uploaded_files_uploaded_by', 'uploaded_files', ['uploaded_by'], unique=False)
    
    # 创建 tasks 表
    op.create_table(
        'tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('status', sa.Enum('INIT', 'UPLOADED', 'PARSING', 'NORMALIZING', 'MATCHING', 'AGGREGATING', 'FINISHED', 'FAILED', name='task_status'), nullable=False, default='INIT'),
        sa.Column('progress', sa.Float, nullable=False, default=0.0),
        sa.Column('message', sa.String(500), nullable=False, default=''),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('summary', sa.JSON, nullable=True),
        sa.Column('file_ids', sa.JSON, nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=True),
        sa.Column('finished_at', sa.DateTime, nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_tasks_status', 'tasks', ['status'], unique=False)
    op.create_index('ix_tasks_user_id', 'tasks', ['user_id'], unique=False)
    
    # 创建 reconciliation_results 表
    op.create_table(
        'reconciliation_results',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text('gen_random_uuid()')),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('order_number', sa.String(100), nullable=False),
        sa.Column('platform_order_number', sa.String(100), nullable=True),
        sa.Column('status', sa.Enum('MATCHED', 'EXCEPTION', 'MISSING', name='result_status'), nullable=False),
        sa.Column('local_amount', sa.Float, nullable=False, default=0.0),
        sa.Column('platform_amount', sa.Float, nullable=False, default=0.0),
        sa.Column('amount_diff', sa.Float, nullable=False, default=0.0),
        sa.Column('local_status', sa.String(50), nullable=True),
        sa.Column('platform_status', sa.String(50), nullable=True),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, default=sa.func.now()),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_reconciliation_results_order_number', 'reconciliation_results', ['order_number'], unique=False)
    op.create_index('ix_reconciliation_results_status', 'reconciliation_results', ['status'], unique=False)
    op.create_index('ix_reconciliation_results_task_id', 'reconciliation_results', ['task_id'], unique=False)
    op.create_index('idx_task_status', 'reconciliation_results', ['task_id', 'status'], unique=False)


def downgrade() -> None:
    """Downgrade to a previous revision."""
    op.drop_index('idx_task_status', table_name='reconciliation_results')
    op.drop_index('ix_reconciliation_results_task_id', table_name='reconciliation_results')
    op.drop_index('ix_reconciliation_results_status', table_name='reconciliation_results')
    op.drop_index('ix_reconciliation_results_order_number', table_name='reconciliation_results')
    op.drop_table('reconciliation_results')
    
    op.drop_index('ix_tasks_user_id', table_name='tasks')
    op.drop_index('ix_tasks_status', table_name='tasks')
    op.drop_table('tasks')
    
    op.drop_index('ix_uploaded_files_uploaded_by', table_name='uploaded_files')
    op.drop_index('ix_uploaded_files_file_type', table_name='uploaded_files')
    op.drop_table('uploaded_files')
    
    op.drop_index('ix_users_username', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
    
    op.execute('DROP TYPE IF EXISTS file_type')
    op.execute('DROP TYPE IF EXISTS result_status')
    op.execute('DROP TYPE IF EXISTS task_status')
    op.execute('DROP TYPE IF EXISTS user_role')
