class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.2.1"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.1/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "cd2612bd977a4d3f7c475ab4dbdeb37df76efe4c371141875ed148516f74d91d"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.1/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "4e40f81846944466e6af411cb989416136e0c7ff61f87e537248b9f5c3ee6e9b"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.1/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "d55aef7471565b9599da29b8755aeb9cdad5468c4226f6e904fb8ed7bb240696"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.2.1", shell_output("#{bin}/cpos help 2>&1")
  end
end
