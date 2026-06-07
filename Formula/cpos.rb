class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.1.6"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.6/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "7e8340237488038c765ac00e4116b0d5dceff27be4f3f9710fa4ff67c3dd1f9c"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.6/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "1041ec334206319102a22308282dcd25c5ea1d7579721e62e311495797d4c83f"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.1.6/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "eec72c0e25575708b79cd3d5760f698b865c28b976f9d5c3bcea11f7888cf7d0"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.1.6", shell_output("#{bin}/cpos help 2>&1")
  end
end
