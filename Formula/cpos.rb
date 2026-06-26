class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.2.2"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.2/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "7702382fc07b377f89462dededa92aee4dc8064b28d914c7a8fa70670e11771f"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.2/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "b564340e62893184273b03add5e91461192e6dc933fe262465d69e30cd07b70d"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.2/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "0b03328d5e2b59f0e1f786b20108c8ed6969a671b7133bbd3b26d2f945114c41"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.2.2", shell_output("#{bin}/cpos help 2>&1")
  end
end
