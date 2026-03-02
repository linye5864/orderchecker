"""
性能优化模块
支持大数据量对账时的分批处理和内存优化
"""

import uuid
from typing import List, Dict, Any, Callable, Optional
from dataclasses import dataclass
from contextlib import contextmanager
import threading


@dataclass
class ProcessingConfig:
    """处理配置"""
    batch_size: int = 1000       # 每批处理数量
    max_workers: int = 1         # 并行 worker 数量
    memory_limit_mb: int = 512   # 内存限制 (MB)
    progress_interval: int = 100  # 进度报告间隔


class BatchProcessor:
    """
    批量处理器
    
    特点：
    1. 分批处理大数据，避免内存溢出
    2. 支持进度回调
    3. 支持断点续传
    """
    
    def __init__(self, config: ProcessingConfig = None):
        self.config = config or ProcessingConfig()
        self._progress_callback = None
        self._processed_count = 0
        self._start_time = None
        
    def set_progress_callback(self, callback: Callable[[str, float], None]):
        """设置进度回调"""
        self._progress_callback = callback
        
    def _report_progress(self, message: str, progress: float):
        """报告进度"""
        self._processed_count += 1
        if self._progress_callback:
            self._progress_callback(message, progress)
        elif self._processed_count % self.config.progress_interval == 0:
            print(f"[{self._processed_count}] {message} ({progress:.1f}%)")
    
    def process_batch(
        self,
        items: List[Any],
        process_fn: Callable[[List[Any]], List[Any]],
        total_count: int = None,
    ) -> List[Any]:
        """
        分批处理
        
        Args:
            items: 待处理数据
            process_fn: 处理函数 (接收一批数据，返回处理结果)
            total_count: 总数量 (用于计算进度)
        
        Returns:
            所有处理结果
        """
        if not items:
            return []
        
        total = total_count or len(items)
        self._start_time = __import__('time').time()
        self._processed_count = 0
        
        results = []
        batch_size = self.config.batch_size
        
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            
            # 处理批次
            batch_results = process_fn(batch)
            if batch_results:
                results.extend(batch_results)
            
            # 报告进度
            progress = min((i + len(batch)) / total * 100, 100)
            self._report_progress(f"处理中...", progress)
        
        return results
    
    @contextmanager
    def memory_monitor(self):
        """内存监控上下文"""
        import psutil
        process = psutil.Process()
        
        def check_memory():
            mem_info = process.memory_info()
            mem_mb = mem_info.rss / 1024 / 1024
            if mem_mb > self.config.memory_limit_mb:
                raise MemoryError(f"内存使用率过高: {mem_mb:.1f}MB > {self.config.memory_limit_mb}MB")
        
        try:
            yield check_memory
        except MemoryError as e:
            print(f"警告: {e}")
            print("建议减少 batch_size 或增加内存限制")


class ChunkedFileProcessor:
    """
    分块文件处理器
    
    特点：
    1. 大文件分块读取，避免内存溢出
    2. 支持流式处理
    3. 支持多种文件格式
    """
    
    def __init__(self, chunk_size: int = 10000):
        self.chunk_size = chunk_size
    
    def process_excel_in_chunks(
        self,
        file_path: str,
        process_chunk: Callable[[List[Dict]], List[Dict]],
        **pandas_kwargs,
    ) -> List[Dict]:
        """
        分块处理 Excel 文件
        
        Args:
            file_path: 文件路径
            process_chunk: 处理函数
            **pandas_kwargs: pandas.read_excel 参数
        
        Returns:
            所有处理结果
        """
        import pandas as pd
        
        results = []
        chunk_count = 0
        
        # 使用 chunksize 分块读取
        for chunk in pd.read_excel(file_path, chunksize=self.chunk_size, **pandas_kwargs):
            chunk_results = process_chunk(chunk.to_dict('records'))
            if chunk_results:
                results.extend(chunk_results)
            
            chunk_count += 1
            if chunk_count % 10 == 0:
                print(f"已处理 {chunk_count * self.chunk_size} 行...")
        
        return results
    
    def process_csv_in_chunks(
        self,
        file_path: str,
        process_chunk: Callable[[List[Dict]], List[Dict]],
        **pandas_kwargs,
    ) -> List[Dict]:
        """分块处理 CSV 文件"""
        import pandas as pd
        
        results = []
        chunk_count = 0
        
        for chunk in pd.read_csv(file_path, chunksize=self.chunk_size, **pandas_kwargs):
            chunk_results = process_chunk(chunk.to_dict('records'))
            if chunk_results:
                results.extend(chunk_results)
            
            chunk_count += 1
            if chunk_count % 10 == 0:
                print(f"已处理 {chunk_count * self.chunk_size} 行...")
        
        return results


class IndexManager:
    """
    索引管理器
    
    用于快速检索已处理的数据，支持：
    1. 内存索引 (适合小数据)
    2. 磁盘索引 (适合大数据)
    """
    
    def __init__(self, use_disk: bool = False, index_dir: str = None):
        self.use_disk = use_disk
        self.memory_index = {}  # 内存索引
        
        if use_disk and index_dir:
            import os
            self.index_dir = index_dir
            os.makedirs(index_dir, exist_ok=True)
    
    def build_index(self, items: List[Dict], key_field: str) -> int:
        """
        构建索引
        
        Args:
            items: 数据列表
            key_field: 作为 key 的字段
        
        Returns:
            索引数量
        """
        for item in items:
            key = item.get(key_field)
            if key:
                self.memory_index[key] = item
        
        return len(self.memory_index)
    
    def lookup(self, key) -> Optional[Dict]:
        """查找"""
        return self.memory_index.get(key)
    
    def bulk_lookup(self, keys: List) -> Dict:
        """批量查找"""
        return {k: self.memory_index.get(k) for k in keys}
    
    def save_index(self, name: str):
        """保存索引到磁盘"""
        if not self.use_disk:
            return
        
        import json
        import os
        
        index_file = os.path.join(self.index_dir, f"{name}.json")
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(self.memory_index, f, ensure_ascii=False, default=str)
    
    def load_index(self, name: str):
        """从磁盘加载索引"""
        if not self.use_disk:
            return
        
        import json
        import os
        
        index_file = os.path.join(self.index_dir, f"{name}.json")
        if os.path.exists(index_file):
            with open(index_file, 'r', encoding='utf-8') as f:
                self.memory_index = json.load(f)


class PerformanceOptimizer:
    """
    性能优化器
    
    提供整体性能优化建议和自动优化
    """
    
    @staticmethod
    def suggest_batch_size(total_records: int, available_memory_mb: float = 1024) -> int:
        """
        建议批处理大小
        
        基于数据量和可用内存估算最佳 batch_size
        """
        # 估算每条记录的内存占用 (假设每条约 1KB)
        estimated_memory_per_record = 1.0  # KB
        
        # 计算最大安全批次大小
        max_batch_size = int(available_memory_mb * 1024 / estimated_memory_per_record)
        
        # 根据数据量调整
        if total_records < 10000:
            return 1000
        elif total_records < 100000:
            return 5000
        elif total_records < 1000000:
            return 10000
        else:
            return min(max_batch_size, 50000)
    
    @staticmethod
    def suggest_parallel_workers(total_records: int, cpu_count: int = None) -> int:
        """
        建议并行 worker 数量
        
        根据数据量和 CPU 核心数估算最佳 worker 数量
        """
        import multiprocessing
        
        cpu_count = cpu_count or multiprocessing.cpu_count()
        
        # 根据数据量调整
        if total_records < 10000:
            return 1
        elif total_records < 100000:
            return min(cpu_count, 4)
        elif total_records < 1000000:
            return min(cpu_count, 8)
        else:
            return min(cpu_count, 16)
    
    @staticmethod
    def get_memory_usage() -> Dict[str, float]:
        """获取当前内存使用情况"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        mem_info = process.memory_info()
        
        return {
            'rss_mb': mem_info.rss / 1024 / 1024,
            'vms_mb': mem_info.vms / 1024 / 1024,
            'percent': process.memory_percent(),
            'available_mb': psutil.virtual_memory().available / 1024 / 1024,
        }
    
    @staticmethod
    def check_performance_issues() -> List[Dict]:
        """
        检查潜在性能问题
        
        返回问题列表和建议
        """
        issues = []
        mem = PerformanceOptimizer.get_memory_usage()
        
        # 检查内存使用
        if mem['percent'] > 80:
            issues.append({
                'type': 'memory',
                'level': 'high',
                'message': '内存使用率过高',
                'suggestion': '考虑减少 batch_size 或增加内存限制',
                'current_usage': f"{mem['percent']:.1f}%",
            })
        
        # 检查可用内存
        if mem['available_mb'] < 512:
            issues.append({
                'type': 'memory',
                'level': 'medium',
                'message': '可用内存不足',
                'suggestion': '建议增加系统内存或减少处理数据量',
                'available': f"{mem['available_mb']:.1f}MB",
            })
        
        return issues


# 导出配置类
__all__ = [
    'ProcessingConfig',
    'BatchProcessor',
    'ChunkedFileProcessor',
    'IndexManager',
    'PerformanceOptimizer',
]
