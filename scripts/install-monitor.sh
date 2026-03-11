#!/usr/bin/env bash
# ============================================================
# CC-Balancer 监控服务安装/卸载脚本（macOS launchd）
# 用法：
#   安装：bash scripts/install-monitor.sh
#   卸载：bash scripts/install-monitor.sh --uninstall
# ============================================================

set -euo pipefail

# --- 配置 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_LABEL="com.cc-balancer.monitor"
PLIST_TEMPLATE="${SCRIPT_DIR}/com.cc-balancer.monitor.plist"
PLIST_DEST="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
MONITOR_SCRIPT="${SCRIPT_DIR}/monitor.sh"
LOG_DIR="${HOME}/Library/Logs"

# --- 颜色输出 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # 无颜色

info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

# --- 卸载函数 ---
uninstall() {
    info "开始卸载 CC-Balancer 监控服务..."

    # 先尝试停止服务
    if launchctl list | grep -q "${PLIST_LABEL}" 2>/dev/null; then
        info "停止服务: ${PLIST_LABEL}"
        launchctl unload "${PLIST_DEST}" 2>/dev/null || true
    fi

    # 删除 plist 文件
    if [[ -f "${PLIST_DEST}" ]]; then
        rm -f "${PLIST_DEST}"
        info "已删除: ${PLIST_DEST}"
    else
        warn "plist 文件不存在: ${PLIST_DEST}"
    fi

    info "卸载完成"
}

# --- 安装函数 ---
install() {
    info "开始安装 CC-Balancer 监控服务..."

    # 检查依赖文件
    if [[ ! -f "${MONITOR_SCRIPT}" ]]; then
        error "未找到监控脚本: ${MONITOR_SCRIPT}"
        exit 1
    fi

    if [[ ! -f "${PLIST_TEMPLATE}" ]]; then
        error "未找到 plist 模板: ${PLIST_TEMPLATE}"
        exit 1
    fi

    # 确保监控脚本有执行权限
    chmod +x "${MONITOR_SCRIPT}"

    # 确保 LaunchAgents 目录存在
    mkdir -p "${HOME}/Library/LaunchAgents"

    # 如果已有旧服务在运行，先停止
    if launchctl list | grep -q "${PLIST_LABEL}" 2>/dev/null; then
        warn "检测到已有服务在运行，先停止旧服务"
        launchctl unload "${PLIST_DEST}" 2>/dev/null || true
    fi

    # 从模板生成 plist，替换占位符为实际路径
    info "生成 plist 配置文件..."
    sed -e "s|__MONITOR_SCRIPT_PATH__|${MONITOR_SCRIPT}|g" \
        -e "s|__LOG_DIR__|${LOG_DIR}|g" \
        "${PLIST_TEMPLATE}" > "${PLIST_DEST}"

    info "plist 已写入: ${PLIST_DEST}"

    # 加载服务
    info "加载 launchd 服务..."
    launchctl load "${PLIST_DEST}"

    # 验证服务是否运行
    if launchctl list | grep -q "${PLIST_LABEL}"; then
        info "服务已成功启动"
    else
        warn "服务可能未成功启动，请检查日志:"
        warn "  cat ${LOG_DIR}/cc-balancer-monitor-error.log"
    fi

    echo ""
    info "安装完成！"
    info "监控日志: ${LOG_DIR}/cc-balancer-monitor.log"
    info "错误日志: ${LOG_DIR}/cc-balancer-monitor-error.log"
    info "卸载命令: bash ${SCRIPT_DIR}/install-monitor.sh --uninstall"
}

# --- 入口 ---
case "${1:-}" in
    --uninstall|-u)
        uninstall
        ;;
    --help|-h)
        echo "用法:"
        echo "  安装: bash $0"
        echo "  卸载: bash $0 --uninstall"
        ;;
    "")
        install
        ;;
    *)
        error "未知参数: $1"
        echo "用法: bash $0 [--uninstall|--help]"
        exit 1
        ;;
esac
