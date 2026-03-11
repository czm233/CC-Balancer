#!/usr/bin/env bash
# ============================================================
# CC-Balancer 监控脚本（macOS 端）
# 用途：定期检查周期状态，在临近禁区或进入禁区时发送系统通知
# 部署位置：MacBook，通过 launchd 每 60 秒调用一次
# ============================================================

set -euo pipefail

# --- 脚本所在目录 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- 加载核心判断引擎 ---
source "${SCRIPT_DIR}/cycle-engine.sh"

# --- 通知状态文件（防止重复通知，每天重置） ---
NOTIFY_STATE_DIR="${TMPDIR:-/tmp}"
NOTIFY_STATE_FILE="${NOTIFY_STATE_DIR}/cc-balancer-notify-$(date +%Y%m%d)"

# --- 通知函数：发送 macOS 系统通知 ---
send_notification() {
    local title="$1"
    local message="$2"
    osascript -e "display notification \"${message}\" with title \"${title}\" sound name \"Glass\"" 2>/dev/null || true
}

# --- 检查是否已发送过某类通知（同一天内不重复） ---
# 参数：$1=通知类型标识（如 "warning" / "blocked"）
has_notified() {
    local notify_type="$1"
    [[ -f "${NOTIFY_STATE_FILE}" ]] && grep -q "^${notify_type}$" "${NOTIFY_STATE_FILE}" 2>/dev/null
}

# --- 标记某类通知已发送 ---
mark_notified() {
    local notify_type="$1"
    echo "${notify_type}" >> "${NOTIFY_STATE_FILE}"
}

# --- 清理过期的状态文件（保留今天的，删除之前的） ---
cleanup_old_state_files() {
    local today
    today="$(date +%Y%m%d)"
    for f in "${NOTIFY_STATE_DIR}"/cc-balancer-notify-*; do
        [[ -f "$f" ]] || continue
        local file_date
        file_date="$(basename "$f" | sed 's/cc-balancer-notify-//')"
        if [[ "${file_date}" != "${today}" ]]; then
            rm -f "$f"
        fi
    done
}

# --- 主逻辑 ---
main() {
    # 清理过期状态文件
    cleanup_old_state_files

    # 获取当前周期状态
    get_cycle_status

    case "${CYCLE_STATUS}" in
        safe)
            # 检查是否临近禁区（距禁区 ≤ ALERT_MINUTES_BEFORE 分钟）
            if (( MINUTES_TO_BLOCK > 0 && MINUTES_TO_BLOCK <= ALERT_MINUTES_BEFORE )); then
                # 每 10 分钟级别只通知一次（检查和标记使用同一个 key）
                local notify_key="warning_$(( MINUTES_TO_BLOCK / 10 * 10 ))"
                if ! has_notified "${notify_key}"; then
                    send_notification "CC-Balancer" "距离禁区还有约 ${MINUTES_TO_BLOCK} 分钟，请准备收尾工作"
                    mark_notified "${notify_key}"
                fi
            fi
            # 白天安全期或夜间充裕时间，不做任何事
            ;;
        active)
            # 禁区内但有活跃周期，发一次提醒即可
            if ! has_notified "active"; then
                send_notification "CC-Balancer" "已进入禁区时段，检测到活跃周期，可继续使用。距安全期还有 ${MINUTES_TO_SAFE} 分钟"
                mark_notified "active"
            fi
            ;;
        blocked)
            # 禁区且无活跃周期
            if ! has_notified "blocked"; then
                send_notification "CC-Balancer" "已进入禁区，无活跃周期。Claude Code 将在 06:00 重置，距安全期还有 ${MINUTES_TO_SAFE} 分钟"
                mark_notified "blocked"
            fi
            ;;
    esac
}

main "$@"
