#!/usr/bin/env bash
#=============================================================
# SSH Key Installer Optimized
# Version: 3.0 (Refactored)
# Description: Safer, cleaner, and more robust SSH key installer
#=============================================================

# --- 全局配置与变量定义 ---
VERSION=3.0
RED="\033[31m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RESET="\033[0m"
INFO="[${GREEN}INFO${RESET}]"
ERROR="[${RED}ERROR${RESET}]"
WARN="[${YELLOW}WARN${RESET}]"

# 检测运行环境并统一定义路径
if [[ "$(uname -o)" == "Android" ]]; then
    IS_ANDROID=true
    SSH_CONFIG="${PREFIX}/etc/ssh/sshd_config"
    # Termux 不需要 sudo
    CMD_PREFIX=""
else
    IS_ANDROID=false
    SSH_CONFIG="/etc/ssh/sshd_config"
    # 非 root 用户需要 sudo
    [[ $EUID -ne 0 ]] && CMD_PREFIX="sudo" || CMD_PREFIX=""
fi

# --- 辅助函数 ---

USAGE() {
    echo -e "
${GREEN}SSH Key Installer v$VERSION${RESET}

Usage:
  bash $0 [options...] <arg>

Options:
  -o    Overwrite mode (Overwrite authorized_keys)
  -g    Install specific GitHub user's public key
  -u    Install public key from URL
  -f    Install public key from local file
  -p    Change SSH listening port (1-65535)
  -d    Disable password authentication
  -e    Enable password authentication [optional: 'new_password']
"
}

# 检查并备份配置文件
backup_config() {
    if [[ ! -f "$SSH_CONFIG" ]]; then
        echo -e "${ERROR} Config file not found: $SSH_CONFIG"
        exit 1
    fi
    local backup_file="${SSH_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
    echo -e "${INFO} Backing up sshd_config to ${backup_file}..."
    $CMD_PREFIX cp "$SSH_CONFIG" "$backup_file" || {
        echo -e "${ERROR} Failed to backup config file!"
        exit 1
    }
}

# 重启 SSH 服务
restart_sshd() {
    echo -e "${INFO} Restarting/Reloading SSH service..."
    if $IS_ANDROID; then
        echo -e "${WARN} On Termux/Android, please restart the App or manually run 'sshd' to apply changes."
    else
        if command -v systemctl >/dev/null 2>&1; then
            $CMD_PREFIX systemctl restart sshd && echo -e "${INFO} Service restarted."
        elif command -v service >/dev/null 2>&1; then
            $CMD_PREFIX service ssh restart && echo -e "${INFO} Service restarted."
        else
            echo -e "${WARN} Could not detect init system. Please restart sshd manually."
        fi
    fi
}

# --- 核心逻辑函数 ---

get_github_key() {
    [[ -z "${KEY_ID}" ]] && read -r -e -p "Enter GitHub username: " KEY_ID
    [[ -z "${KEY_ID}" ]] && echo -e "${ERROR} Invalid input." && exit 1
    
    echo -e "${INFO} Fetching key for GitHub user: ${KEY_ID}..."
    PUB_KEY=$(curl -fsSL "https://github.com/${KEY_ID}.keys")
    
    if [[ "$PUB_KEY" == "Not Found" ]]; then
        echo -e "${ERROR} GitHub user not found."
        exit 1
    elif [[ -z "$PUB_KEY" ]]; then
        echo -e "${ERROR} No keys found for this user."
        exit 1
    fi
}

get_url_key() {
    [[ -z "${KEY_URL}" ]] && read -r -e -p "Enter URL: " KEY_URL
    [[ -z "${KEY_URL}" ]] && echo -e "${ERROR} Invalid input." && exit 1
    
    echo -e "${INFO} Fetching key from URL..."
    PUB_KEY=$(curl -fsSL "${KEY_URL}")
}

get_local_key() {
    [[ -z "${KEY_PATH}" ]] && read -r -e -p "Enter local file path: " KEY_PATH
    [[ -z "${KEY_PATH}" ]] && echo -e "${ERROR} Invalid input." && exit 1
    
    echo -e "${INFO} Reading key from ${KEY_PATH}..."
    if [[ ! -f "$KEY_PATH" ]]; then
        echo -e "${ERROR} File not found."
        exit 1
    fi
    PUB_KEY=$(cat "${KEY_PATH}")
}

install_key() {
    [[ -z "$PUB_KEY" ]] && echo -e "${ERROR} Key content is empty." && exit 1

    local ssh_dir="${HOME}/.ssh"
    local auth_file="${ssh_dir}/authorized_keys"

    # 准备目录
    if [[ ! -d "$ssh_dir" ]]; then
        echo -e "${INFO} Creating .ssh directory..."
        mkdir -p "$ssh_dir"
        chmod 700 "$ssh_dir"
    fi

    # 写入密钥
    if [[ "$OVERWRITE" == 1 ]]; then
        echo -e "${INFO} Overwriting authorized_keys..."
        echo -e "$PUB_KEY" > "$auth_file"
    else
        echo -e "${INFO} Appending to authorized_keys..."
        # 确保文件末尾有换行符再追加
        [[ -f "$auth_file" ]] && [[ -n "$(tail -c1 "$auth_file")" ]] && echo "" >> "$auth_file"
        echo -e "$PUB_KEY" >> "$auth_file"
    fi

    chmod 600 "$auth_file"

    # 验证写入
    if grep -qF "$PUB_KEY" "$auth_file"; then
        echo -e "${INFO} SSH Key added successfully."
    else
        echo -e "${ERROR} Failed to write SSH key."
        exit 1
    fi

    # 强制开启公钥认证 (使用统一变量 $SSH_CONFIG)
    backup_config
    echo -e "${INFO} Ensuring PubkeyAuthentication is enabled..."
    $CMD_PREFIX sed -i "s@^#*\(PubkeyAuthentication\).*@\1 yes@" "$SSH_CONFIG" || \
    echo "PubkeyAuthentication yes" | $CMD_PREFIX tee -a "$SSH_CONFIG" >/dev/null
    
    restart_sshd
}

change_port() {
    # 端口验证：必须是数字且在 1-65535 之间
    if [[ ! "$SSH_PORT" =~ ^[0-9]+$ ]] || [ "$SSH_PORT" -lt 1 ] || [ "$SSH_PORT" -gt 65535 ]; then
        echo -e "${ERROR} Invalid port number: $SSH_PORT (Must be 1-65535)"
        exit 1
    fi

    backup_config
    echo -e "${INFO} Changing SSH port to ${SSH_PORT}..."
    
    # 检查是否已存在 Port 配置
    if grep -q "^Port " "$SSH_CONFIG"; then
        $CMD_PREFIX sed -i "s@^Port .*@Port ${SSH_PORT}@" "$SSH_CONFIG"
    else
        echo "Port ${SSH_PORT}" | $CMD_PREFIX tee -a "$SSH_CONFIG" >/dev/null
    fi

    echo -e "${INFO} SSH port updated."
    restart_sshd
}

disable_password() {
    backup_config
    echo -e "${INFO} Disabling password authentication..."
    $CMD_PREFIX sed -i "s@^#*\(PasswordAuthentication\).*@\1 no@" "$SSH_CONFIG"
    restart_sshd
}

enable_password() {
    backup_config
    echo -e "${INFO} Enabling password authentication..."
    $CMD_PREFIX sed -i "s@^#*\(PasswordAuthentication\).*@\1 yes@" "$SSH_CONFIG"

    # 修改密码逻辑
    local new_pass="$1"
    if [[ -n "$new_pass" ]]; then
        echo -e "${INFO} Updating user password..."
        if $IS_ANDROID; then
            echo -e "$new_pass\n$new_pass" | passwd >/dev/null 2>&1
        else
            echo "$USER:$new_pass" | $CMD_PREFIX chpasswd
        fi
        
        if [ $? -eq 0 ]; then
             echo -e "${INFO} Password updated successfully."
        else
             echo -e "${ERROR} Failed to update password."
        fi
    fi
    restart_sshd
}

# --- 主程序入口 ---

[[ $# -eq 0 ]] && USAGE && exit 1

# 解析参数
while getopts ":og:u:f:p:de::" OPT; do
    case $OPT in
        o) OVERWRITE=1 ;;
        g) KEY_ID=$OPTARG; get_github_key; install_key ;;
        u) KEY_URL=$OPTARG; get_url_key; install_key ;;
        f) KEY_PATH=$OPTARG; get_local_key; install_key ;;
        p) SSH_PORT=$OPTARG; change_port ;;
        d) disable_password ;;
        e) 
           # 处理 -e 的可选参数 (Hack 逻辑: 检查下一个参数是否以 - 开头)
           # 注意：getopts 标准不支持可选参数，这里使用双冒号 :: 配合特殊处理
           # 为简单起见，这里假设 -e 必须紧跟参数，或者不跟。
           # 下面的逻辑是原生 getopts 对可选参数的一种处理尝试，
           # 但更稳妥的方式是直接把密码作为必选参数，或者只开启不改密。
           # 此处保留原逻辑风格但进行了修正。
           enable_password "$OPTARG" 
           ;; 
        :) 
           if [[ "$OPTARG" == "e" ]]; then
               enable_password ""
           else
               echo -e "${ERROR} Option -$OPTARG requires an argument."
               exit 1
           fi
           ;;
        \?) USAGE; exit 1 ;;
    esac
done
