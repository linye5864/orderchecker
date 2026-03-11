"""
OrderComparer 本地对账测试脚本
在 backend 目录下运行，使用 TripartiteReconciliationEngine V2 引擎
"""

import os
import sys
from pathlib import Path

# 确保工作目录是 backend
BACKEND_DIR = Path(__file__).resolve().parent
os.chdir(str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR))

from datetime import datetime
import uuid
import argparse

from sqlalchemy.orm import Session
from app.core.database import engine, get_db, Base
from app.models.orm_task import Task
from app.models.orm_user import User
from app.models.orm_reconciliation import TripartiteReconciliation, ReconciliationSummary
from app.services.reconciliation_engine_v2 import TripartiteReconciliationEngine
from app.models.task import TaskStatus


def get_file_path(filename: str) -> str:
    """获取 data 目录下文件路径"""
    # 历史上仓库层级可能不同，这里从 backend 目录向上逐级查找 `data/filename`。
    for base_dir in [BACKEND_DIR, *BACKEND_DIR.parents]:
        data_dir = base_dir / "data"
        filepath = data_dir / filename
        if filepath.exists():
            return str(filepath)

    raise FileNotFoundError(f"文件不存在: {filename} (未在上级目录的 data/ 中找到)")


def ensure_user_exists(db: Session) -> User:
    """确保测试用户存在"""
    test_user = db.query(User).first()
    if not test_user:
        test_user = User(
            id=uuid.uuid4(),
            username='test_user',
            email='test@example.com',
            hashed_password='hashed',
            role='viewer',
            is_active=True,
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        print(f"  [INFO] 创建测试用户: {test_user.id}")
    return test_user


def run_reconciliation(platform: str = "dada") -> str:
    """
    执行本地对账测试
    
    Args:
        platform: 平台代码 (dada, sf, hh, uu, ss, gxd, sf_enterprise)
    
    Returns:
        任务ID
    """
    print("=" * 70)
    print("  OrderComparer 本地对账测试 (V2 引擎)")
    print("=" * 70)
    print()
    
    # 平台代码到文件名的映射
    platform_files = {
        "dada": "达达账单.xlsx",
        "sf": "顺丰账单.xlsx",
        "sf_enterprise": "顺丰企业C账单.xlsx",
        "hh": "蜂鸟账单.xlsx",
        "uu": "UU跑腿账单.xlsx",
        "ss": "闪送账单.xlsx",
        "gxd": "裹小递账单.xlsx",
    }
    
    if platform not in platform_files:
        print(f"✗ 不支持的平台: {platform}")
        print(f"  可用平台: {', '.join(platform_files.keys())}")
        sys.exit(1)
    
    platform_name = platform_files[platform]
    
    # 文件路径
    delivery_file = get_file_path("配送单.xlsx")
    flow_file = get_file_path("流水账单.xlsx")
    platform_file = get_file_path(platform_name)
    
    print(f"使用数据文件:")
    print(f"  配送单: {Path(delivery_file).name}")
    print(f"  流水账单: {Path(flow_file).name}")
    print(f"  平台账单: {Path(platform_file).name}")
    print()
    
    # 确保数据库表存在
    print("[1/5] 初始化数据库...")
    Base.metadata.create_all(bind=engine)
    
    db = next(get_db())
    
    try:
        # 确保测试用户存在
        test_user = ensure_user_exists(db)
        
        # 创建任务
        print("[2/5] 创建对账任务...")
        task = Task(
            name=f"本地对账-{platform.upper()}-{datetime.now().strftime('%Y%m%d %H:%M')}",
            status=TaskStatus.INIT.value,
            progress=0.0,
            message="任务已创建",
            user_id=test_user.id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        print(f"  任务ID: {task.id}")
        print(f"  任务名称: {task.name}")
        print()
        
        # 创建 V2 对账引擎
        print("[3/5] 初始化 V2 对账引擎...")
        engine_v2 = TripartiteReconciliationEngine(db, task.id)
        
        # 进度回调（减少数据库写入）
        progress_counter = 0
        def progress_callback(message: str, prog: float = None):
            nonlocal progress_counter
            if prog is not None:
                progress_counter += 1
                # 每 10% 或重要节点才更新数据库
                if prog >= 100 or prog == 0 or progress_counter % 10 == 0:
                    db.query(Task).filter(Task.id == task.id).update({
                        Task.progress: prog,
                        Task.message: message,
                    })
                    db.commit()
                    if prog < 100:
                        print(f"  进度: {prog:5.1f}% - {message}")
        
        engine_v2._progress = progress_callback
        
        # 执行对账
        print("[4/5] 执行三方对账...")
        print("-" * 50)
        
        summary = engine_v2.perform_reconciliation(
            delivery_file_path=delivery_file,
            flow_file_path=flow_file,
            platform_files={platform: platform_file},
        )
        
        print("-" * 50)
        print()
        
        # 更新任务状态
        print("[5/5] 保存结果...")
        db.query(Task).filter(Task.id == task.id).update({
            Task.status: TaskStatus.FINISHED.value,
            Task.progress: 100.0,
            Task.message: "对账完成",
        })
        
        # 检查是否已存在汇总
        existing_summary = db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == task.id
        ).first()
        
        if not existing_summary:
            db_summary = ReconciliationSummary(
                task_id=task.id,
                total_orders=summary.total_orders,
                matched_orders=summary.matched_orders,
                match_rate=summary.match_rate,
                minor_discrepancy_orders=summary.minor_discrepancy_orders,
                major_discrepancy_orders=summary.major_discrepancy_orders,
                missing_data_orders=summary.missing_data_orders,
                total_delivery_amount=summary.total_delivery_amount,
                total_flow_amount=summary.total_flow_amount,
                total_platform_amount=summary.total_platform_amount,
                total_diff_delivery_vs_flow=summary.total_diff_delivery_vs_flow,
                total_diff_delivery_vs_platform=summary.total_diff_delivery_vs_platform,
            )
            db.add(db_summary)
        
        db.commit()
        
        # 打印结果
        print()
        print("=" * 70)
        print("  对账结果汇总")
        print("=" * 70)
        print()
        print(f"任务ID: {task.id}")
        print()
        print("【订单统计】")
        print(f"  总订单数:   {summary.total_orders:,}")
        print(f"  匹配成功:   {summary.matched_orders:,}")
        print(f"  匹配率:     {summary.match_rate:.2f}%")
        print(f"  小差异:     {summary.minor_discrepancy_orders:,}")
        print(f"  大差异:     {summary.major_discrepancy_orders:,}")
        print(f"  缺失数据:   {summary.missing_data_orders:,}")
        print()
        print("【金额统计 (¥)】")
        print(f"  配送单总额:   {summary.total_delivery_amount:>12,.2f}")
        print(f"  流水单总额:   {summary.total_flow_amount:>12,.2f}")
        print(f"  平台账单总额: {summary.total_platform_amount:>12,.2f}")
        print()
        print("【差异分析 (¥)】")
        diff1 = summary.total_diff_delivery_vs_flow
        diff2 = summary.total_diff_delivery_vs_platform
        print(f"  配送-流水差异: {diff1:>+12,.2f}")
        print(f"  配送-平台差异: {diff2:>+12,.2f}")
        print()
        print("=" * 70)
        print(f"  任务ID (API查询): {task.id}")
        print("=" * 70)
        print()
        print("API 查询方式:")
        print(f"  curl http://localhost:8000/api/v1/reconciliation/results/{task.id}")
        print()
        
        return str(task.id)
        
    finally:
        db.close()


def query_result(task_id: str):
    """查询对账结果"""
    print()
    print("=" * 70)
    print("  对账结果详情")
    print("=" * 70)
    print()
    
    db = next(get_db())
    
    try:
        task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
        
        if not task:
            print(f"✗ 任务不存在: {task_id}")
            return
        
        print(f"任务: {task.name}")
        print(f"状态: {task.status}")
        print(f"进度: {task.progress:.1f}%")
        print(f"创建时间: {task.created_at}")
        print()
        
        summary = db.query(ReconciliationSummary).filter(
            ReconciliationSummary.task_id == task.id
        ).first()
        
        if summary:
            print("【1. 平台级统计 (配送单汇总)】")
            print("-" * 70)
            print(f"{'平台':<15} {'订单量':>10} {'总扣款(应该)':>15} {'匹配率':>10}")
            print("-" * 70)
            
            # 从 summary.platform_statistics (JSON) 中读取平台汇总
            platform_stats = summary.platform_statistics or {}
            for p_id, stats in platform_stats.items():
                print(f"{stats.get('carrier', p_id):<15} {stats.get('total_orders', 0):>10,} {stats.get('total_amount', 0):>15,.2f} {stats.get('match_rate', 0):>9.1f}%")
            print("-" * 70)
            print()

            print("【2. 商户账户统计 (流水单汇总)】")
            print("-" * 70)
            print(f"{'商户ID':<15} {'订单量':>10} {'扣款总计(实际)':>15} {'期初余额':>12} {'期末余额':>12}")
            print("-" * 70)
            
            from app.models.orm_flow import MerchantSummary
            merchant_summaries = db.query(MerchantSummary).filter(MerchantSummary.task_id == task.id).limit(10).all()
            for ms in merchant_summaries:
                print(f"{ms.admin_id:<15} {ms.total_deductions:>10,} {ms.total_deduction_amount:>15,.2f} {ms.balance_before:>12,.2f} {ms.balance_after:>12,.2f}")
            print("-" * 70)
            print()
        
        details = db.query(TripartiteReconciliation).filter(
            TripartiteReconciliation.task_id == task.id
        ).limit(5).all()
        
        if details:
            print("【3. 三方对账明细 (三方金额对比样例)】")
            print("-" * 120)
            print(f"{'订单号':<32} {'配送(应该)':>12} {'流水(实际)':>12} {'三方(三方扣)':>12} {'差异(配送-三方)':>15} {'状态':<10}")
            print("-" * 120)
            for d in details:
                status = d.status if isinstance(d.status, str) else d.status.value
                print(f"{d.delivery_order_sn[:31]:<32} {d.delivery_amount:>12.2f} {d.flow_amount:>12.2f} {d.platform_amount:>12.2f} {d.diff_delivery_vs_platform:>+15.2f} {status:<10}")
            print("-" * 120)
            print()
        
        print("=" * 70)
        print(f"  任务执行状态: {task.status}")
        print(f"  API 快速查询: GET /api/v1/reconciliation/results/{task_id}")
        print("=" * 70)
        
    finally:
        db.close()


def list_available_platforms():
    """列出可用的平台"""
    print("=" * 70)
    print("  可用的对账平台")
    print("=" * 70)
    print()
    
    platforms = [
        ("dada", "达达", "达达账单.xlsx"),
        ("sf", "顺丰", "顺丰账单.xlsx"),
        ("sf_enterprise", "顺丰企业C", "顺丰企业C账单.xlsx"),
        ("hh", "蜂鸟", "蜂鸟账单.xlsx"),
        ("uu", "UU跑腿", "UU跑腿账单.xlsx"),
        ("ss", "闪送", "闪送账单.xlsx"),
        ("gxd", "裹小递", "裹小递账单.xlsx"),
    ]
    
    # 优先使用项目根目录的 data 文件夹
    # BACKEND_DIR = orderchecker/packages/backend
    # 需要 back 3 级到项目根目录
    data_dir = BACKEND_DIR.parent.parent.parent / "data"
    if not data_dir.exists():
        data_dir = BACKEND_DIR / "data"
    
    available = []
    
    for code, name, filename in platforms:
        filepath = data_dir / filename
        if filepath.exists():
            available.append((code, name))
            print(f"  ✓ {name:8s} (使用: {filename})")
            print(f"      命令: python local_reconciliation_test.py --platform {code}")
        else:
            print(f"  ✗ {name:8s} ({filename} 不存在)")
    
    print()
    print("使用方法:")
    print("  python local_reconciliation_test.py --platform <平台代码>")
    print("  python local_reconciliation_test.py --query <任务ID>")
    print("  python local_reconciliation_test.py --list")
    print("  python local_reconciliation_test.py --recent")
    print()
    
    return available


def list_recent_tasks(limit: int = 5):
    """列出最近的对账任务"""
    print()
    print("=" * 70)
    print("  最近的对账任务")
    print("=" * 70)
    print()
    
    db = next(get_db())
    
    try:
        tasks = db.query(Task).order_by(Task.created_at.desc()).limit(limit).all()
        
        if not tasks:
            print("  没有对账任务")
            return
        
        for t in tasks:
            summary = db.query(ReconciliationSummary).filter(
                ReconciliationSummary.task_id == t.id
            ).first()
            
            match_rate = summary.match_rate if summary else 0
            orders = summary.total_orders if summary else 0
            matched = summary.matched_orders if summary else 0
            
            status_icon = "✓" if t.status == "FINISHED" else "⏳"
            has_result = "有结果" if summary else "处理中"
            
            print(f"{status_icon} [{t.status:8s}] {t.name[:40]}")
            print(f"           ID: {t.id}")
            print(f"           订单: {orders:,} / 匹配: {matched:,} ({match_rate:.1f}%) [{has_result}]")
            print(f"           时间: {t.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
            print()
            
        print("查询任务:")
        print("  python local_reconciliation_test.py --query <任务ID>")
        print("  python local_reconciliation_test.py --recent")
        print()
        
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="OrderComparer 本地对账测试 (V2 引擎)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python local_reconciliation_test.py --list                      # 列出可用平台
  python local_reconciliation_test.py --platform dada             # 执行达达对账
  python local_reconciliation_test.py --platform sf               # 执行顺丰对账
  python local_reconciliation_test.py --platform ss               # 执行闪送对账
  python local_reconciliation_test.py --query <任务ID>            # 查询任务结果
  python local_reconciliation_test.py --recent                    # 列出最近任务

说明:
  - 使用 TripartiteReconciliationEngine V2 引擎
  - 支持配送单 vs 流水单 vs 平台账单 三方对账
  - 数据文件位于: data/ 目录
        """
    )
    
    parser.add_argument("--platform", "-p", default="dada",
                        help="平台代码 (dada, sf, hh, uu, ss, gxd, sf_enterprise)")
    parser.add_argument("--list", "-l", action="store_true",
                        help="列出可用平台")
    parser.add_argument("--query", "-q", type=str,
                        help="查询任务结果 (提供任务ID)")
    parser.add_argument("--recent", "-r", action="store_true",
                        help="列出最近的对账任务")
    
    args = parser.parse_args()
    
    if args.list:
        list_available_platforms()
    elif args.query:
        query_result(args.query)
    elif args.recent:
        list_recent_tasks()
    else:
        task_id = run_reconciliation(args.platform)
        query_result(task_id)
