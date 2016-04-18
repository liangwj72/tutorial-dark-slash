cc.Class({
    extends: cc.Component,

    properties: {
        fxTrail: cc.ParticleSystem,
        spArrow: cc.Node,
        sfAtkDirs: [cc.SpriteFrame],
        attachPoints: [cc.Vec2],
        sfPostAtks: [cc.SpriteFrame],
        spPlayer: cc.Sprite,
        spSlash: cc.Sprite,
        hurtRadius: 0,
        touchThreshold: 0,
        touchMoveThreshold: 0,
        atkDist: 0,
        atkDuration: 0,
        atkStun: 0
    },

    // use this for initialization
    init (game) {
        this.game = game;
        this.anim = this.getComponent('Move').anim;
        this.inputEnabled = false;
        this.isAttacking = false;
        this.isAlive = true;
        this.nextPoseSF = null;
        this.registerInput();
        this.spArrow.active = false;
        this.atkTargetPos = cc.p(0,0);
        this.isAtkGoingOut = false;
        this.validAtkRect = cc.rect(50, 50, (this.node.parent.width - 100), (this.node.parent.height - 100));
        this.oneSlashKills = 0;
    },

    registerInput () {
        var self = this;
        // touch input
        cc.eventManager.addListener({
            event: cc.EventListener.TOUCH_ONE_BY_ONE,
            onTouchBegan: function(touch, event) {
                if (self.inputEnabled === false) {
                    return true;
                }
                var touchLoc = touch.getLocation();
                self.touchBeganLoc = touchLoc;
                self.moveToPos = self.node.parent.convertToNodeSpaceAR(touchLoc);
                self.touchStartTime = Date.now();
                return true; // don't capture event
            },
            onTouchMoved: function(touch, event) {
                if (self.inputEnabled === false) {
                    return;
                }
                var touchLoc = touch.getLocation();
                self.spArrow.active = true;
                self.moveToPos = self.node.parent.convertToNodeSpaceAR(touchLoc);
                if (cc.pDistance(self.touchBeganLoc, touchLoc) > self.touchMoveThreshold) {
                    self.hasMoved = true;
                }
            },
            onTouchEnded: function(touch, event) {
                if (self.inputEnabled === false) {
                    return;
                }
                self.spArrow.active = false;
                self.moveToPos = null;
                self.node.emit('update-dir', {
                    dir: null
                });
                let isHold = self.isTouchHold();
                if (!self.hasMoved && !isHold) {
                    var touchLoc = touch.getLocation();
                    let atkPos = self.node.parent.convertToNodeSpaceAR(touchLoc);
                    let atkDir = cc.pSub(atkPos, self.node.position);
                    self.atkTargetPos = cc.pAdd( self.node.position, cc.pMult(cc.pNormalize(atkDir), self.atkDist) );
                    let atkPosWorld = self.node.parent.convertToWorldSpaceAR(self.atkTargetPos);
                    if (!cc.rectContainsPoint(self.validAtkRect, atkPosWorld)) {
                        self.isAtkGoingOut = true;
                    } else {
                        self.isAtkGoingOut = false;
                    }
                    self.node.emit('freeze');
                    self.oneSlashKills = 0;
                    self.attackOnTarget(atkDir, self.atkTargetPos);
                }
                self.hasMoved = false;
            }
        }, self.node);
    },

    ready () {
        this.fxTrail.resetSystem();
        this.node.emit('stand');
        this.inputEnabled = true;
        this.isAlive = true;
    },

    isTouchHold () {
        let timeDiff = Date.now() - this.touchStartTime;
        return ( timeDiff >= this.touchThreshold);
    },

    attackOnTarget (atkDir, targetPos) {
        var self = this;
        let deg = cc.radiansToDegrees(cc.pAngleSigned(cc.p(0, 1), atkDir));
        let angleDivider = [0, 12, 35, 56, 79, 101, 124, 146, 168, 180];
        let slashPos = null;
        function getAtkSF(mag, sfAtkDirs) {
            let atkSF = null;
            for (let i = 1; i < angleDivider.length; ++i) {
                let min = angleDivider[i - 1];
                let max = angleDivider[i];
                if (mag <= max && mag > min) {
                    atkSF = sfAtkDirs[i - 1];
                    self.nextPoseSF = self.sfPostAtks[Math.floor(( i - 1 )/3)];
                    slashPos = self.attachPoints[i - 1];
                    return atkSF;
                }
            }
            if (atkSF === null) {
                console.error('cannot find correct attack pose sprite frame! mag: ' + mag);
                return null;
            }
        }

        let mag = Math.abs(deg);
        if (deg <= 0) {
            this.spPlayer.node.scaleX = 1;
            this.spPlayer.spriteFrame = getAtkSF(mag, this.sfAtkDirs);
        } else {
            this.spPlayer.node.scaleX = -1;
            this.spPlayer.spriteFrame = getAtkSF(mag, this.sfAtkDirs);
        }

        let moveAction = cc.moveTo(this.atkDuration, targetPos).easing(cc.easeQuinticActionOut());
        let delay = cc.delayTime(this.atkStun);
        let callback = cc.callFunc(this.onAtkFinished, this);
        this.node.runAction(cc.sequence(moveAction, delay, callback));
        this.spSlash.node.position = slashPos;
        this.spSlash.node.rotation = mag;
        this.spSlash.enabled = true;
        this.spSlash.getComponent(cc.Animation).play('slash');
        this.inputEnabled = false;
        this.isAttacking = true;
    },

    onAtkFinished () {
        if (this.nextPoseSF) {
            this.spPlayer.spriteFrame = this.nextPoseSF;
        }
        this.spSlash.enabled = false;
        this.inputEnabled = true;
        this.isAttacking = false;
        this.isAtkGoingOut = false;
        if (this.oneSlashKills >= 3) {
            this.game.inGameUI.showKills(this.oneSlashKills);
        }
    },
    
    addKills () {
        this.oneSlashKills++;  
    },

    revive () {
        let hideCB = cc.callFunc(function() {
            this.node.active = false;
        }.bind(this));
        let action = cc.sequence(cc.delayTime(0.6), hideCB);
    },

    dead () {
        this.node.emit('freeze');
        this.isAlive = false;
        this.isAttacking = false;
        this.inputEnabled = false;
        this.anim.play('dead');
    },

    corpse () {
        this.anim.play('corpse');
        this.scheduleOnce(this.death, 0.7);
    },

    death () {
        this.game.death();
    },

    // called every frame, uncomment this function to activate update callback
    update (dt) {
        if (this.isAlive === false) {
            return;
        }
        if (this.isAttacking) {
            // if (this.node.x > this.node.parent.width/2 * 0.95) {
            //     this.node.x = this.node.parent.width/2 * 0.95;
            //     shouldStopAction = true;
            // }
            // if (this.node.x < -this.node.parent.width/2 * 0.95 ) {
            //     this.node.x = -this.node.parent.width/2 * 0.95;
            //     shouldStopAction = true;
            // }
            // if (this.node.y > this.node.parent.height/2 * 0.9) {
            //     this.node.y = this.node.parent.height/2 * 0.9;
            //     shouldStopAction = true;
            // }
            // if (this.node.y < -this.node.parent.height/2 * 0.9) {
            //     this.node.y = -this.node.parent.height/2 * 0.9;
            //     shouldStopAction = true;
            // }
            

            if (this.isAtkGoingOut) {
                let curWorldPos = this.node.parent.convertToWorldSpaceAR(this.node.position);
                if (!cc.rectContainsPoint(this.validAtkRect, curWorldPos)) {
                    this.node.stopAllActions();
                    this.onAtkFinished();              
                }
            }
        }

        if (this.inputEnabled && this.moveToPos && this.isTouchHold()) {
            let dir = cc.pSub(this.moveToPos, this.node.position);
            let rad = cc.pToAngle(dir);
            let deg = cc.radiansToDegrees(rad);
            this.spArrow.rotation = 90-deg;
            this.node.emit('update-dir', {
                dir: cc.pNormalize(dir)
            });
        }
    },
});