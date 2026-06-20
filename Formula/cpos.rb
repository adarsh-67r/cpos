class Cpos < Formula
  desc "Competitive Programming Operating System terminal app"
  homepage "https://github.com/Soham109/cpos"
  version "0.2.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.0/cpos-aarch64-apple-darwin.tar.gz"
      sha256 "fe1a480d761d29f69a92f379e162a36d8fb793d532fede6502e48906e05b5a8e"
    end

    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.0/cpos-x86_64-apple-darwin.tar.gz"
      sha256 "7e2f1fb9be76df50f18a53f9b0bba2b4918d13e2665d375ecb118459adc6584e"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/Soham109/cpos/releases/download/v0.2.0/cpos-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "5c3b61fd11045c8001e131a4f8017bd6291dd363649e5af5c92ad094f63780a6"
    end
  end

  def install
    bin.install "cpos"
  end

  test do
    assert_match "CPOS v0.2.0", shell_output("#{bin}/cpos help 2>&1")
  end
end
