#!/usr/bin/env bash
# ============================================================
# CC-Balancer 凌晨激活脚本（Ubuntu 服务器端）
# 用途：在凌晨 01:00-01:59 运行，调用 Claude Code 非交互模式
#       发送一条简单消息，激活新的 5 小时周期（覆盖到 06:00+）
# 部署位置：Ubuntu 服务器
# ============================================================

set -euo pipefail

# --- 配置 ---
LOG_FILE="${HOME}/cc-balancer-activator.log"
# 扩展 PATH 以覆盖常见安装位置（cron 环境 PATH 通常很精简）
export PATH="${HOME}/.local/bin:${HOME}/.nvm/versions/node/$(ls -1 "${HOME}/.nvm/versions/node/" 2>/dev/null | tail -1)/bin:/usr/local/bin:${PATH}"
# Claude 命令路径（如果不在 PATH 中，请修改为绝对路径）
CLAUDE_CMD="claude"
# 激活命令参数
CLAUDE_ARGS=(-p "say ok" --dangerously-skip-permissions)
# 超时时间（秒），防止 claude 进程挂起
TIMEOUT_SECONDS=60

# --- 日志函数 ---
log() {
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[${timestamp}] $*" >> "${LOG_FILE}"
}

# --- 主逻辑 ---
main() {
    log "===== 激活脚本启动 ====="

    # 检查当前时间是否在预期窗口内（01:00-01:59）
    local current_hour
    current_hour=$(date +%-H)
    if (( current_hour != 1 )); then
        log "警告: 当前时间为 ${current_hour} 点，不在预期的激活窗口（01:00-01:59），仍继续执行"
    fi

    # 检查 claude 命令是否存在
    if ! command -v "${CLAUDE_CMD}" > /dev/null 2>&1; then
        log "错误: 未找到 ${CLAUDE_CMD} 命令，请确认 Claude Code 已安装且在 PATH 中"
        log "===== 激活失败 ====="
        exit 1
    fi

    # 执行激活命令
    log "执行: ${CLAUDE_CMD} ${CLAUDE_ARGS[*]}"
    local exit_code=0
    local output
    output=$(timeout "${TIMEOUT_SECONDS}" "${CLAUDE_CMD}" "${CLAUDE_ARGS[@]}" 2>&1) || exit_code=$?

    if (( exit_code == 0 )); then
        log "激活成功"
        log "Claude 输出: ${output}"
    elif (( exit_code == 124 )); then
        # timeout 命令超时返回 124
        log "错误: 命令超时（${TIMEOUT_SECONDS} 秒），Claude 进程已被终止"
        log "===== 激活失败（超时） ====="
        exit 1
    else
        log "错误: 命令执行失败，退出码=${exit_code}"
        log "错误输出: ${output}"
        log "===== 激活失败 ====="
        exit 1
    fi

    log "===== 激活完成 ====="
}

main "$@"

# ============================================================
# cron 配置说明
# ============================================================
# 使用 crontab -e 添加以下行（选择 01:15 而非整点，避开系统定时任务高峰）：
#
# 15 1 * * * /path/to/scripts/activator.sh
#
# 示例（假设脚本在用户主目录下）：
# 15 1 * * * ${HOME}/CC-Balancer/scripts/activator.sh
#
# 注意事项：
# 1. 确保 Claude Code CLI 在 cron 环境的 PATH 中，
#    如果不在，请使用绝对路径，例如：
#    CLAUDE_CMD="/usr/local/bin/claude"
# 2. 如需查看日志：tail -f ~/cc-balancer-activator.log
# 3. 激活后的 5 小时周期将覆盖 01:15 ~ 06:15，确保 06:00 满血
# ============================================================
