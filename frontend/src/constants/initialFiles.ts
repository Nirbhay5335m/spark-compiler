import { ProjectFile } from '../types';

export const INITIAL_FILES: ProjectFile[] = [
  {
    id: 'file-main',
    name: 'main.py',
    path: '/main.py',
    language: 'python',
    content: `"""
Spark Compiler - Query & Execution Pipeline Entrypoint
Runtime: Apache Spark 4.2 / Python 3.13
"""
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, upper, when, count, avg

def main():
    print("==================================================")
    print("  SPARK COMPILER - PIPELINE EXECUTION ENGINE     ")
    print("==================================================")

    # 1. Initialize local SparkSession
    print("[SPARK] Initializing local SparkSession...")
    spark = (
        SparkSession.builder
        .master("local[1]")
        .appName("SparkCompilerDemo")
        .config("spark.ui.enabled", "false")
        .config("spark.driver.host", "127.0.0.1")
        .config("spark.driver.bindAddress", "127.0.0.1")
        .config("spark.sql.shuffle.partitions", "1")
        .getOrCreate()
    )
    print(f"[SPARK] Session acquired successfully (Spark v{spark.version}).")

    # 2. Ingest structured compiler module data
    data = [
        (101, "Lexer", "active", 1420, 12.5),
        (102, "Parser", "active", 980, 8.2),
        (103, "Optimizer", "pending", 0, 0.0),
        (104, "CodeGenerator", "active", 3100, 24.1),
        (105, "SparkBridge", "active", 5400, 45.0),
        (106, "TypeChecker", "active", 2150, 18.3),
    ]
    columns = ["module_id", "module_name", "status", "tokens_processed", "latency_ms"]

    df = spark.createDataFrame(data, columns)
    print(f"[SPARK] Created DataFrame with {df.count()} records.")

    # 3. Apply Transformations
    print("\\n--- Original DataFrame ---")
    df.show()

    transformed_df = (
        df.withColumn("module_upper", upper(col("module_name")))
        .withColumn(
            "throughput_tier",
            when(col("tokens_processed") > 2000, "HIGH")
            .when(col("tokens_processed") > 0, "STANDARD")
            .otherwise("IDLE")
        )
    )

    print("--- Transformed Pipeline Modules ---")
    transformed_df.select("module_id", "module_upper", "status", "tokens_processed", "throughput_tier").show()

    # 4. Aggregations by status
    print("--- Aggregated Metrics by Status ---")
    agg_df = transformed_df.groupBy("status").agg(
        count("*").alias("total_modules"),
        avg("tokens_processed").alias("avg_tokens"),
        avg("latency_ms").alias("avg_latency_ms")
    )
    agg_df.show()

    # 5. Safe session shutdown
    print("[SPARK] Pipeline execution complete. Stopping SparkSession...")
    spark.stop()
    print("[SPARK] SparkSession halted cleanly.")
    return transformed_df

if __name__ == "__main__":
    result = main()
`,
  },
  {
    id: 'file-query-sql',
    name: 'query.sql',
    path: '/query.sql',
    language: 'sql',
    content: `-- =======================================================
-- Spark SQL Query Editor
-- All CSV datasets are registered as temporary SQL tables
-- Example: ecommerce.csv -> table 'ecommerce'
-- =======================================================

SELECT 
    product_category,
    COUNT(*) AS total_orders,
    ROUND(SUM(amount), 2) AS total_revenue,
    ROUND(AVG(amount), 2) AS avg_order_value,
    ROUND(MIN(amount), 2) AS min_order_amount,
    ROUND(MAX(amount), 2) AS max_order_amount
FROM 
    ecommerce
WHERE 
    status = 'COMPLETED'
GROUP BY 
    product_category
ORDER BY 
    total_revenue DESC;
`,
  },
  {
    id: 'folder-compiler',
    name: 'compiler',
    path: '/compiler',
    language: '',
    content: '',
    isFolder: true,
    isExpanded: true,
    children: [
      {
        id: 'file-lexer',
        name: 'lexer.py',
        path: '/compiler/lexer.py',
        language: 'python',
        content: `"""Spark SQL & AST Lexer Tokenizer."""
import re
from typing import List, Tuple

TOKEN_TYPES = [
    ('KEYWORD', r'\\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|JOIN|FILTER)\\b'),
    ('IDENTIFIER', r'[a-zA-Z_][a-zA-Z0-9_]*'),
    ('NUMBER', r'\\b\\d+(\\.\\d+)?\\b'),
    ('OPERATOR', r'[=><!+*/-]'),
]

def tokenize(source_code: str) -> List[Tuple[str, str]]:
    tokens = []
    print(f"Tokenizing query input: {len(source_code)} characters")
    return tokens
`,
      },
      {
        id: 'file-parser',
        name: 'parser.py',
        path: '/compiler/parser.py',
        language: 'python',
        content: `"""Abstract Syntax Tree (AST) Generator."""

class ASTNode:
    def __init__(self, node_type: str, value: str = None):
        self.node_type = node_type
        self.value = value
        self.children = []

def parse_ast(tokens):
    root = ASTNode("QueryPlan")
    return root
`,
      },
    ],
  },
  {
    id: 'folder-jobs',
    name: 'jobs',
    path: '/jobs',
    language: '',
    content: '',
    isFolder: true,
    isExpanded: false,
    children: [
      {
        id: 'file-etl',
        name: 'etl_pipeline.py',
        path: '/jobs/etl_pipeline.py',
        language: 'python',
        content: `"""Distributed Batch ETL Job."""
from pyspark.sql.functions import col, avg, to_date

def run_etl(spark, input_path: str, output_path: str):
    df = spark.read.csv(input_path, header=True, inferSchema=True)
    clean_df = df.filter(col("amount") > 0).withColumn("date", to_date(col("timestamp")))
    clean_df.write.mode("overwrite").parquet(output_path)
`,
      },
    ],
  },
  {
    id: 'folder-data',
    name: 'data',
    path: '/data',
    language: '',
    content: '',
    isFolder: true,
    isExpanded: false,
    children: [
      {
        id: 'file-ecommerce',
        name: 'ecommerce.csv',
        path: '/data/ecommerce.csv',
        language: 'csv',
        content: `order_id,customer_id,product_category,amount,currency,status
1001,CUST-982,Electronics,249.99,USD,COMPLETED
1002,CUST-104,Apparel,45.50,USD,COMPLETED
1003,CUST-381,Home & Kitchen,112.00,USD,PENDING
1004,CUST-982,Electronics,899.00,USD,COMPLETED
1005,CUST-551,Books,19.95,USD,REFUNDED
1006,CUST-723,Computers,1450.00,USD,COMPLETED
`,
      },
    ],
  },
];
