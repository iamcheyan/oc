#!/usr/bin/env python3
"""
 簡単なサンプルプログラム：数字当てゲームと統計分析
"""

from __future__ import annotations

import random
import statistics as stats
from dataclasses import dataclass
from enum import Enum, auto
from typing import Final

# 定数定義
DEFAULT_MIN_NUM: Final = 1
DEFAULT_MAX_NUM: Final = 100
DEFAULT_MAX_ATTEMPTS: Final = 10
SEPARATOR_WIDTH: Final = 50

POSITIVE_ANSWERS: Final = frozenset({'y', 'yes', '是', 'yep', 'sure', 'ok'})

DEMO_NUMBERS: Final = [23, 56, 12, 89, 34, 67, 45, 78, 91, 15]


class GuessResult(Enum):
    """推測結果列挙"""
    TOO_LOW = auto()
    TOO_HIGH = auto()
    CORRECT = auto()

    @property
    def message(self) -> str:
        """結果に対応するメッセージを取得"""
        return {
            GuessResult.TOO_LOW: "📈 小さすぎです！もう少し大きくしてください",
            GuessResult.TOO_HIGH: "📉 大きすぎです！もう少し小さくしてください",
            GuessResult.CORRECT: "🎉 おめでとうございます！正解です！",
        }[self]


@dataclass(frozen=True, slots=True)
class GameResult:
    """ゲーム結果データクラス"""
    won: bool
    secret_number: int
    attempts_used: int
    max_attempts: int

    @property
    def success_rate(self) -> str:
        """成功率を計算"""
        return f"{self.attempts_used}/{self.max_attempts}"

    @property
    def message(self) -> str:
        """ゲーム結果メッセージを取得"""
        if self.won:
            return f"🌟 ゲームクリア！成功率: {self.success_rate}"
        return "💪 がんばって、もう一度試してください！"


@dataclass(frozen=True, slots=True)
class Statistics:
    """統計データクラス"""
    count: int
    total: float
    average: float
    minimum: int
    maximum: int

    def __str__(self) -> str:
        """フォーマットされた統計出力"""
        return f"""  件数: {self.count}
  合計: {self.total:.2f}
  平均: {self.average:.2f}
  最小: {self.minimum}
  最大: {self.maximum}"""


class InvalidInputError(Exception):
    """无效输入异常"""
    pass


def calculate_statistics(numbers: list[int]) -> Statistics:
    """计算数字列表的统计信息

    Args:
        numbers: 非空数字列表

    Returns:
        Statistics对象

    Raises:
        ValueError: 如果列表为空
    """
    if not numbers:
        raise ValueError("列表不能为空")

    return Statistics(
        count=len(numbers),
        total=sum(numbers),
        average=stats.mean(numbers),
        minimum=min(numbers),
        maximum=max(numbers),
    )


def get_integer_input(prompt: str) -> int | None:
    """获取有效的整数输入"""
    try:
        return int(input(prompt))
    except ValueError:
        return None


def ask_yes_no(question: str) -> bool:
    """询问是/否问题"""
    return input(f"{question} (y/n): ").lower().strip() in POSITIVE_ANSWERS


def print_header(title: str, width: int = SEPARATOR_WIDTH) -> None:
    """打印标题"""
    print("=" * width)
    print(title)
    print("=" * width)


def print_separator(char: str = "-", width: int = SEPARATOR_WIDTH) -> None:
    """打印分隔线"""
    print(char * width)


def print_victory(secret: int, attempts: int) -> None:
    """打印胜利消息"""
    print(f"🏆 答案就是 {secret}，你用了 {attempts} 次就猜中了！")


def print_game_over(secret: int) -> None:
    """打印游戏结束消息"""
    print(f"😢 很遗憾，你已经用完所有机会。正确答案是: {secret}")


def print_remaining(remaining: int) -> None:
    """打印剩余机会"""
    print(f"💡 还有 {remaining} 次机会")


def print_invalid_input() -> None:
    """打印无效输入提示"""
    print("⚠️  请输入一个有效的数字！")


def evaluate_guess(guess: int, secret: int) -> GuessResult:
    """评估猜测结果"""
    diff = guess - secret
    if diff < 0:
        return GuessResult.TOO_LOW
    if diff > 0:
        return GuessResult.TOO_HIGH
    return GuessResult.CORRECT


def demo_statistics() -> None:
    """演示统计计算功能"""
    print("📊 统计计算示例:")
    print(f"数字列表: {DEMO_NUMBERS}")
    print(calculate_statistics(DEMO_NUMBERS))


class NumberGuessingGame:
    """数字猜谜游戏"""

    def __init__(
        self,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        min_num: int = DEFAULT_MIN_NUM,
        max_num: int = DEFAULT_MAX_NUM,
    ):
        self.max_attempts = max_attempts
        self.min_num = min_num
        self.max_num = max_num
        self._secret = random.randint(min_num, max_num)
        self._attempts = 0

    def _get_valid_guess(self) -> int | None:
        """获取有效的猜测输入"""
        self._attempts += 1
        guess = get_integer_input(f"第 {self._attempts} 次猜测: ")
        if guess is None:
            print_invalid_input()
        return guess

    def _play_round(self) -> bool:
        """进行一轮游戏，返回是否猜中"""
        guess = self._get_valid_guess()
        if guess is None:
            return False

        result = evaluate_guess(guess, self._secret)
        print(result.message)

        if result == GuessResult.CORRECT:
            print_victory(self._secret, self._attempts)
            return True

        remaining = self.max_attempts - self._attempts
        if remaining:
            print_remaining(remaining)
        print()

        return False

    def play(self) -> GameResult:
        """运行游戏"""
        print_header("🎮 数字猜谜游戏")
        print(f"我已经想好了一个{self.min_num}到{self.max_num}之间的数字。"
              f"你有{self.max_attempts}次机会猜中它！")
        print()

        while self._attempts < self.max_attempts:
            if self._play_round():
                return GameResult(True, self._secret, self._attempts, self.max_attempts)

        print()
        print_game_over(self._secret)
        return GameResult(False, self._secret, self.max_attempts, self.max_attempts)


def main() -> None:
    """主函数"""
    print("欢迎使用 Python 示例程序！")
    print()

    demo_statistics()

    print()
    print_separator()
    print()

    if not ask_yes_no("是否开始猜谜游戏？"):
        print()
        print("感谢使用！再见！👋")
        return

    print()
    game = NumberGuessingGame()
    result = game.play()
    print()

    print(result.message)

    print()
    print("感谢使用！再见！👋")


if __name__ == "__main__":
    main()
