(() => {

    "use strict";

    /*
        BUILD.JS MAIN CONTROLLER HAI.

        script.js sirf basic browser helper hai.
        Isliye yahan koi timer/timeline start nahi hoga.
    */

    const sceneIds = [
        "question",
        "timer",
        "answer",
        "comment",
        "explanation"
    ];


    function showScene(id) {

        document
            .querySelectorAll(".scene")
            .forEach(scene => {

                scene.classList.remove(
                    "active"
                );

            });


        const target =
            document.getElementById(id);


        if (target) {

            target.classList.add(
                "active"
            );
        }
    }


    function resetScenes() {

        document
            .querySelectorAll(".scene")
            .forEach(scene => {

                scene.classList.remove(
                    "active"
                );

            });
    }


    window.reelApp = {

        showScene,

        resetScenes,

        sceneIds

    };

})();