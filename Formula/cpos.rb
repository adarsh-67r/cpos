class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.1.7"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.7/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "4976346b0d303660dde575785f0ab4a6b427826f209cdd2626960eda4355cded"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.7/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "de0d29d35314cf9e846eafaf7160358ac4a5807a468c0296b0b18549d79e7a5b"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.7/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "0f10ce1e5372218920fe10bdc3823848cd612b6c392c5e2214237f446d51cf5f"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.1.7", shell_output("#{bin}/cpos help 2>&1")
  end
end
