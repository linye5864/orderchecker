"""
端到端集成测试 - 模拟完整对账流程
"""
import uuid
import asyncio
from app.core.database import SessionLocal
from app.services.file_service import FileProcessingService
from app.services.task_crud_service import TaskCRUDService
from app.tasks.executor import TaskExecutionService
from app.models.orm_reconciliation import TripartiteReconciliation

async def run_e2e():
    db = SessionLocal()
    print("\n🚀 开始 E2E 集成测试\n")
    
    try:
        # 1. 模拟文件上传 (复用已存在的物理文件，只创建记录)
        # 假设文件已经在 uploads 目录，我们查找数据库里现有的文件记录直接复用
        # 即使前端重传，物理路径可能不变，我们找最新的 delivery/flow/platform 文件
        
        from app.models.orm_file import UploadedFile
        from sqlalchemy import desc
        
        # 找配送单
        f_delivery = db.query(UploadedFile).filter(UploadedFile.file_type == 'delivery').order_by(desc(UploadedFile.created_at)).first()
        # 找流水单
        f_flow = db.query(UploadedFile).filter(UploadedFile.file_type == 'flow').order_by(desc(UploadedFile.created_at)).first()
        # 找平台单
        f_platform = db.query(UploadedFile).filter(UploadedFile.file_type == 'platform').order_by(desc(UploadedFile.created_at)).first()
        
        if not f_delivery or not f_flow:
            print("❌ 缺少必要文件记录 (delivery/flow)，无法进行测试")
            return

        file_ids = [str(f_delivery.id), str(f_flow.id)]
        if f_platform:
            file_ids.append(str(f_platform.id))
            
        print(f"📦 准备使用文件: {len(file_ids)} 个")
        print(f"   - 配送单: {f_delivery.original_filename}")
        print(f"   - 流水单: {f_flow.original_filename}")
        if f_platform:
            print(f"   - 平台单: {f_platform.original_filename}")

        # 2. 创建对账任务
        print("\n🔨 创建任务...")
        task_service = TaskCRUDService(db)
        # 用一个固定的 user_id 或者 mock 一个
        user_id = uuid.uuid4() 
        
        task = task_service.create(
            name="E2E自动测试任务",
            description="模拟前端完整流程",
            file_ids=file_ids,
            user_id=str(user_id)
        )
        print(f"✅ 任务创建成功: {task.id}")
        
        # 3. 执行对账 (手动触发执行器)
        print("\n⚙️ 启动执行引擎...")
        executor = TaskExecutionService(db)
        summary = executor.run_reconciliation(task.id, task.file_ids)
        
        print("\n📊 对账执行完成:")
        print(f"   总订单: {summary.total_orders}")
        print(f"   匹配数: {summary.matched_orders}")
        
        # 4. 验证数据库结果
        print("\n🔍 验证落盘数据...")
        count = db.query(TripartiteReconciliation).filter(TripartiteReconciliation.task_id == task.id).count()
        print(f"   数据库明细行数: {count}")
        
        if count == 0:
            print("❌ 失败：数据库为空！")
        else:
            print("✅ 成功：数据流完整贯通！")
            print(f"\n💡 请在前端访问结果页: /results?taskId={task.id}")

    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_e2e())
