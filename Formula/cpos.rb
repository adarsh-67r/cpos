class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.1.8"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.8/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "60bdf6b22fd9b79ebeffeadd03eaf2ce3bfda0ea38a9dc3dca918e6654fd85ea"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.8/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "f3acb6a8e66e7cbe32bfc5a4740c0f1ee4aba851c0dcd73fc20271e87461022c"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.8/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "6e60dd3ceaa13d68ccdcdd419a48c567939311b53d2d5e6e120f3ea4b376ea96"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.1.8", shell_output("#{bin}/cpos help 2>&1")
  end
end
