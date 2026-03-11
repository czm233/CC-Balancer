#!/usr/bin/env bash
# ============================================================
# CC-Balancer 核心判断引擎
# 用途：判断当前时刻是否可以安全使用 Claude Code
# 使用方式：source scripts/cycle-engine.sh
# ============================================================
#
# 方案 B — 纯时间区间判断 + 进程检测
#
# 时间区间划分：
#   06:00 - 20:59  →  白天安全期（safe）
#   21:00 - 01:59  →  夜间可用期（safe）
#   02:00 - 05:59  →  凌晨禁区
#     - 有活跃 claude 进程  →  active（仍在旧周期内，可继续）
#     - 无活跃 claude 进程  →  blocked（禁止启动新周期）
#
# 提供的接口：
#   get_cycle_status  — 主函数，设置全局变量并输出状态信息
#
# 全局变量（调用 get_cycle_status 后可用）：
#   CYCLE_STATUS       — "safe" / "active" / "blocked"
#   CYCLE_REASON       — 状态说明（中文）
#   MINUTES_TO_BLOCK   — 距离禁区开始的剩余分钟数（仅在非禁区时有意义，禁区内为 0）
#   MINUTES_TO_SAFE    — 距离安全期（06:00）的剩余分钟数（仅在禁区内有意义）
#   CURRENT_HOUR       — 当前小时
#   CURRENT_MINUTE     — 当前分钟
# ============================================================

# 加载配置（如果尚未加载）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${BLOCK_START:-}" ]]; then
    # shellcheck source=config.env
    source "${SCRIPT_DIR}/config.env"
fi

# ============================================================
# 辅助函数：计算距离禁区开始（02:00）的分钟数
# 参数：$1=当前小时 $2=当前分钟
# 返回：通过 echo 输出分钟数
# ============================================================
_calc_minutes_to_block() {
    local hour=$1
    local minute=$2
    local target_hour=${BLOCK_START}
    local minutes_remaining

    if (( hour < target_hour )); then
        # 00:00 - 01:59，距离 02:00 的分钟数
        minutes_remaining=$(( (target_hour - hour) * 60 - minute ))
    elif (( hour >= SAFE_DAY_START )); then
        # 06:00 - 23:59，需要跨午夜到次日 02:00
        minutes_remaining=$(( (24 - hour + target_hour) * 60 - minute ))
    else
        # 已经在禁区内（02:00 - 05:59）
        minutes_remaining=0
    fi

    echo "${minutes_remaining}"
}

# ============================================================
# 辅助函数：计算距离安全期（06:00）的分钟数
# 参数：$1=当前小时 $2=当前分钟
# 返回：通过 echo 输出分钟数
# ============================================================
_calc_minutes_to_safe() {
    local hour=$1
    local minute=$2
    local target_hour=${SAFE_DAY_START}
    local minutes_remaining

    if (( hour < target_hour )); then
        # 00:00 - 05:59
        minutes_remaining=$(( (target_hour - hour) * 60 - minute ))
    else
        # 已经过了 06:00，距离下一个 06:00
        minutes_remaining=$(( (24 - hour + target_hour) * 60 - minute ))
    fi

    echo "${minutes_remaining}"
}

# ============================================================
# 辅助函数：检测是否有活跃的 claude 进程
# 返回：0=有活跃进程，1=无活跃进程
# ============================================================
_is_claude_active() {
    pgrep -x "${CLAUDE_PROCESS_NAME}" > /dev/null 2>&1
}

# ============================================================
# 主函数：获取当前周期状态
#
# 用法：
#   get_cycle_status          # 使用系统当前时间
#   get_cycle_status 23 30    # 使用指定时间（测试用）
#
# 调用后设置全局变量：
#   CYCLE_STATUS / CYCLE_REASON / MINUTES_TO_BLOCK / MINUTES_TO_SAFE
# ============================================================
get_cycle_status() {
    # 获取当前时间（支持传入参数覆盖，方便测试）
    if [[ $# -ge 2 ]]; then
        CURRENT_HOUR=$1
        CURRENT_MINUTE=$2
    else
        local time_str
        time_str=$(date '+%-H %-M')
        CURRENT_HOUR=${time_str%% *}
        CURRENT_MINUTE=${time_str##* }
    fi

    # 计算距离禁区和安全期的分钟数
    MINUTES_TO_BLOCK=$(_calc_minutes_to_block "${CURRENT_HOUR}" "${CURRENT_MINUTE}")
    MINUTES_TO_SAFE=$(_calc_minutes_to_safe "${CURRENT_HOUR}" "${CURRENT_MINUTE}")

    # --- 核心三步判断 ---

    # 第一步：白天安全期 06:00 - 20:59
    if (( CURRENT_HOUR >= SAFE_DAY_START && CURRENT_HOUR <= SAFE_DAY_END )); then
        CYCLE_STATUS="safe"
        CYCLE_REASON="白天安全期（${CURRENT_HOUR}:$(printf '%02d' "${CURRENT_MINUTE}")），可自由使用"
        return 0
    fi

    # 第二步：夜间可用期 21:00 - 01:59
    if (( CURRENT_HOUR >= SAFE_NIGHT_START || CURRENT_HOUR <= SAFE_NIGHT_END )); then
        CYCLE_STATUS="safe"
        if (( MINUTES_TO_BLOCK <= ALERT_MINUTES_BEFORE )); then
            CYCLE_REASON="夜间可用期（${CURRENT_HOUR}:$(printf '%02d' "${CURRENT_MINUTE}")），但距禁区仅剩 ${MINUTES_TO_BLOCK} 分钟，请注意"
        else
            CYCLE_REASON="夜间可用期（${CURRENT_HOUR}:$(printf '%02d' "${CURRENT_MINUTE}")），距禁区还有 ${MINUTES_TO_BLOCK} 分钟"
        fi
        return 0
    fi

    # 第三步：凌晨禁区 02:00 - 05:59
    if _is_claude_active; then
        CYCLE_STATUS="active"
        CYCLE_REASON="凌晨禁区（${CURRENT_HOUR}:$(printf '%02d' "${CURRENT_MINUTE}")），检测到活跃的 Claude 进程，可继续使用当前周期"
    else
        CYCLE_STATUS="blocked"
        CYCLE_REASON="凌晨禁区（${CURRENT_HOUR}:$(printf '%02d' "${CURRENT_MINUTE}")），无活跃周期，距安全期还有 ${MINUTES_TO_SAFE} 分钟，禁止启动新周期"
    fi

    return 0
}

# ============================================================
# 便捷函数：输出人类可读的状态摘要
# ============================================================
print_cycle_status() {
    get_cycle_status "$@"

    echo "=========================="
    echo " CC-Balancer 周期状态"
    echo "=========================="
    echo "当前时间: ${CURRENT_HOUR}:$(printf '%02d' "${CURRENT_MINUTE}")"
    echo "状态:     ${CYCLE_STATUS}"
    echo "说明:     ${CYCLE_REASON}"

    if [[ "${CYCLE_STATUS}" != "blocked" ]]; then
        echo "距禁区:   ${MINUTES_TO_BLOCK} 分钟"
    else
        echo "距安全期: ${MINUTES_TO_SAFE} 分钟"
    fi
    echo "=========================="
}

# 如果直接执行此脚本（而非 source），则运行 print_cycle_status
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    print_cycle_status "$@"
fi
