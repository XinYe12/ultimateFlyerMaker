
. /opt/homebrew/opt/asdf/libexec/asdf.sh
eval "$(rbenv init -)"

. /opt/homebrew/opt/asdf/libexec/asdf.sh
export PATH="$PATH:/Users/xuxinye/Documents/projects/flutter/bin"
export PATH=$PATH:/path/to/sdk/platform-tools
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/xuxinye/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/xuxinye/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/xuxinye/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/xuxinye/google-cloud-sdk/completion.zsh.inc'; fi
