ig.module( 
	'game.main' 
)
.requires(
	'impact.game',
	'impact.font'
)
.defines(function(){

ig.MyGame = ig.Game.extend({	
	init: function() {
		// Initialize your game here; bind keys etc.
		ig.input.bind(ig.KEY.LEFT_ARROW,"left");
		ig.input.bind(ig.KEY.RIGHT_ARROW,"right");
		ig.input.bind(ig.KEY.UP_ARROW,"up");
		ig.input.bind(ig.KEY.DOWN_ARROW,"down");
		ig.input.bind(ig.KEY.MOUSE1,"aim");
		ig.input.bind(ig.KEY.MOUSE2,"dash");


	},
	
	update: function() {
		// Update all entities and backgroundMaps
		this.parent();
		var data={};
		if(ig.input.pressed('aim'))data.aimStart=true;
		data.aiming=ig.input.state('aim');
		data.dash=ig.input.state('dash')
		if(ig.input.released('aim'))data.thrown=true;
		data.mouse=ig.input.mouse
		data.move={x:0,y:0};
        if (ig.input.state('left'))
            data.move.x = -1;
        else if (ig.input.state('right'))
            data.move.x = 1;
        if (ig.input.state('up'))
            data.move.y = -1;
        else if (ig.input.state('down'))
            data.move.y = 1;
		ig.conn&&ig.conn.send(data);
	},
	
	draw: function() {
        ig.system.context.drawImage(ig.video,0,0,ig.system.realWidth,ig.system.realHeight)
	}
});



});
