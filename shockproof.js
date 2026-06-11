const phoneFrame = document.querySelector(".phone-frame");
const navButtons = document.querySelectorAll("[data-screen]");
const screens = document.querySelectorAll("[data-panel]");
const nextButtons = document.querySelectorAll("[data-next]");
const recordButton = document.querySelector("[data-record]");

function showScreen(name) {
  const isSignedIn = name !== "signin";

  if (phoneFrame) {
    phoneFrame.classList.toggle("is-signed-in", isSignedIn);
  }

  navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === name);
  });

  screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.panel === name);
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});

nextButtons.forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.next));
});

if (recordButton) {
  recordButton.addEventListener("click", () => {
    const original = recordButton.innerHTML;
    recordButton.disabled = true;
    recordButton.innerHTML = "<span></span> Processing video...";

    window.setTimeout(() => {
      recordButton.innerHTML = "<span></span> Reading detected";
    }, 900);

    window.setTimeout(() => {
      recordButton.disabled = false;
      recordButton.innerHTML = original;
      showScreen("advice");
    }, 1800);
  });
}
