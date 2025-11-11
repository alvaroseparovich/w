# Watchman - The Task Manager

Watchman is a task manager app, runs in web browser. a static webapp, with js in the front-end doing the stuff.

It has some simple capabilities:
- add tasks
  - Start tasks (then it marks the start TimeStamp)
  - Pause tasks (then it marks the pause TimeStamp)
  - When a task is ongoing, it shows how much this task is during.
  - When there is more than 1 start time and pause, it should calculate the total time.
- When a task is on going, it should show a notification like a web player. then it can be paused or played, like a audio player. but it is pausing or playing the task.

The theme is dark.
The core logic is separated in a layer, and the ui uses it by an interface.
By that way the core logic can be used by other apps, and can be tested easily.


----------