<?php
/**
 * DESIGN.md → design preset (DesignSystem/Brief).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\DesignSystem\Brief;

auvyx_test(
	'brief: colors, fonts and radius are read from a markdown brief',
	static function () {
		$md     = "# Acme Outdoor\n\n## Colors\n| Token | Value |\n|---|---|\n| Primary | #0F766E |\n| Primary text | #ffffff |\n- **Secondary text**: #475569\n- Background: #FFFDF8\n- Error: #b91c1c\n\n## Type\nHeading font: Fraunces\nBody font: Inter\nBorder radius: 10px\nButton radius: 999px\n";
		$preset = Brief::from_rules( $md );
		auvyx_assert_same( 'Acme Outdoor', $preset['name'] );
		auvyx_assert_same( '#0f766e', $preset['colors']['primary'] );
		auvyx_assert_same( '#ffffff', $preset['colors']['onPrimary'] );
		auvyx_assert_same( '#475569', $preset['colors']['muted'] );
		auvyx_assert_same( '#fffdf8', $preset['colors']['background'] );
		auvyx_assert_same( '#b91c1c', $preset['colors']['sale'] );
		auvyx_assert_same( 'Fraunces, Georgia, serif', $preset['fonts']['heading'] );
		auvyx_assert_same( 'Inter, system-ui, sans-serif', $preset['fonts']['body'] );
		auvyx_assert_same( '10px', $preset['radius'] );
		auvyx_assert_same( '999px', $preset['buttonRadius'] );
	}
);

auvyx_test(
	'brief: unsafe values never reach the preset',
	static function () {
		$preset = Brief::sanitize(
			array(
				'colors' => array(
					'primary' => 'red;}body{display:none',
					'text'    => '#111111',
					'bogus'   => '#000000',
				),
				'fonts'  => array( 'body' => 'Inter; } <script>' ),
				'radius' => '10vw',
			)
		);
		auvyx_assert_same( array( 'text' => '#111111' ), $preset['colors'] );
		auvyx_assert_same( false, isset( $preset['fonts'] ) );
		auvyx_assert_same( false, isset( $preset['radius'] ) );
	}
);

auvyx_test(
	'brief: applying recolors Auvyx tokens and the theme palette; removing restores the theme',
	static function () {
		$before  = get_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION, null );
		$own     = array( array( 'slug' => 'auvyx-primary', 'name' => 'Auvyx Primary', 'color' => '#2563eb' ) );
		update_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION, array( 'tokens' => array( 'color' => $own ) ) );
		$offline = static fn( $pre, $args, $url ) => false !== strpos( (string) $url, 'fontsource' ) || false !== strpos( (string) $url, 'jsdelivr' ) ? new WP_Error( 'offline', 'offline' ) : $pre;
		add_filter( 'pre_http_request', $offline, 10, 3 );
		Brief::apply(
			array(
				'colors' => array(
					'primary' => '#0f766e',
					'text'    => '#111827',
				),
				'fonts'  => array( 'body' => 'Inter, system-ui, sans-serif' ),
				'radius' => '10px',
			)
		);
		$tokens = array_column( Auvyx\Builder\Plugin::instance()->module( 'design-system' )->get()['tokens']['color'], 'color', 'slug' );
		auvyx_assert_same( '#0f766e', $tokens['auvyx-primary'] );
		$theme = WP_Theme_JSON_Resolver::get_theme_data()->get_data();
		$slugs = array_column( (array) ( $theme['settings']['color']['palette'] ?? array() ), 'color', 'slug' );
		if ( isset( $slugs['contrast'] ) ) {
			auvyx_assert_same( '#111827', $slugs['contrast'] );
		}
		auvyx_assert_same( 'Inter, system-ui, sans-serif', $theme['styles']['typography']['fontFamily'] ?? '' );
		Brief::apply( array( 'colors' => array( 'primary' => '#ff0000' ) ) ); // a second preset
		Brief::clear();
		auvyx_assert_same( $own, get_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION )['tokens']['color'], 'the Auvyx tokens from before the first preset come back' );
		$theme = WP_Theme_JSON_Resolver::get_theme_data()->get_data();
		auvyx_assert_same( false, ( $theme['styles']['typography']['fontFamily'] ?? '' ) === 'Inter, system-ui, sans-serif' );
		remove_filter( 'pre_http_request', $offline, 10 );
		delete_option( Auvyx\Builder\Modules\DesignSystem\Fonts::OPTION );
		null === $before ? delete_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION ) : update_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION, $before );
		Auvyx\Builder\Plugin::instance()->module( 'design-system' )->flush();
	}
);

auvyx_test(
	'brief: Auvyx\'s heading and body families follow the preset\'s fonts once installed, and stay put when one is not',
	static function () {
		$offline = static fn( $pre, $args, $url ) => false !== strpos( (string) $url, 'fontsource' ) || false !== strpos( (string) $url, 'jsdelivr' ) ? new WP_Error( 'offline', 'offline' ) : $pre;
		add_filter( 'pre_http_request', $offline, 10, 3 );
		$fonts   = Auvyx\Builder\Modules\DesignSystem\Fonts::class;
		update_option(
			$fonts::OPTION,
			array(
				'Yeseva One' => array(
					'slug'       => 'auvyx-yeseva-one',
					'name'       => 'Yeseva One',
					'fontFamily' => '"Yeseva One", Georgia, serif',
					'fontFace'   => array(),
				),
			),
			false
		);
		$families    = static function (): array {
			$theme = WP_Theme_JSON_Resolver::get_theme_data()->get_data();
			return array_column( (array) ( $theme['settings']['typography']['fontFamilies'] ?? array() ), 'fontFamily', 'slug' );
		};
		$body_before = $families()['auvyx-body'] ?? '';
		Brief::apply(
			array(
				'fonts' => array(
					'heading' => 'Yeseva One',
					'body'    => 'Not A Real Sans',
				),
			)
		);
		$after = $families();
		auvyx_assert_same( 'var(--wp--preset--font-family--auvyx-yeseva-one)', $after['auvyx-heading'] ?? '' );
		auvyx_assert_same( $body_before, $after['auvyx-body'] ?? '', 'a font that could not be installed leaves the body family as it was' );
		Brief::clear();
		auvyx_assert_same( false, ( $families()['auvyx-heading'] ?? '' ) === 'var(--wp--preset--font-family--auvyx-yeseva-one)', 'clearing the preset gives the heading family back' );
		remove_filter( 'pre_http_request', $offline, 10 );
		delete_option( $fonts::OPTION );
		Auvyx\Builder\Plugin::instance()->module( 'design-system' )->flush();
	}
);

auvyx_test(
	'DESIGN.md: front matter tokens (google-labs-code/design.md) become an exact preset',
	static function () {
		$md    = (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/designmd/paws-and-paths.md' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$split = Auvyx\Builder\Modules\DesignSystem\DesignMd::split( $md );
		auvyx_assert_same( 'Paws & Paths', $split['tokens']['name'] );
		auvyx_assert_same( '#855300', $split['tokens']['colors']['primary'] );
		auvyx_assert_same( '{colors.primary}', $split['tokens']['components']['button-primary']['backgroundColor'] );
		auvyx_assert_contains( '## Brand & Style', $split['body'] );

		$preset = Brief::from_brief( $md );
		auvyx_assert_same( '#855300', $preset['colors']['primary'], 'button-primary background (reference resolved)' );
		auvyx_assert_same( '#ffffff', $preset['colors']['onPrimary'] );
		auvyx_assert_same( '#f9f9ff', $preset['colors']['background'] );
		auvyx_assert_same( '#151c27', $preset['colors']['text'] );
		auvyx_assert_same( '#ba1a1a', $preset['colors']['sale'] );
		auvyx_assert_same( 'Plus Jakarta Sans', $preset['fonts']['heading'] );
		auvyx_assert_same( array( 'fontFamily' => 'Plus Jakarta Sans', 'fontSize' => '44px', 'fontWeight' => '800', 'lineHeight' => '52px', 'letterSpacing' => '-0.02em' ), $preset['type']['display'] );
		auvyx_assert_same( '1rem', $preset['buttonRadius'], '{rounded.lg}' );
		auvyx_assert_same( '0.75rem', $preset['radii']['md'] );
		auvyx_assert_same( '24px', $preset['spacing']['md'] );
		auvyx_assert_same( '#f59e0b', $preset['button']['hoverBackground'] );
		auvyx_assert_same( array( 'Plus Jakarta Sans' ), Auvyx\Builder\Modules\DesignSystem\DesignMd::families( $preset ) );
	}
);

auvyx_test(
	'DESIGN.md: a dark design keeps readable roles; sizes become fluid; line heights relative',
	static function () {
		$preset = Brief::from_brief( (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/designmd/totality-festival.md' ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		auvyx_assert_same( '#121318', $preset['colors']['background'] );
		auvyx_assert_same( '#e3e1e9', $preset['colors']['text'] );
		auvyx_assert_same( true, Auvyx\Builder\Modules\DesignSystem\DesignMd::contrast( $preset['colors']['onPrimary'], $preset['colors']['primary'] ) >= 3, 'button text readable' );
		auvyx_assert_same( true, Auvyx\Builder\Modules\DesignSystem\DesignMd::contrast( $preset['colors']['muted'], $preset['colors']['background'] ) >= 4.5, 'muted text readable' );
		auvyx_assert_contains( 'clamp(', Brief::fluid( '64px' ) );
		auvyx_assert_same( '16px', Brief::fluid( '16px' ) );
		auvyx_assert_same( '1.18', Brief::relative_line_height( '52px', '44px' ) );
	}
);

auvyx_test(
	'DESIGN.md: YAML subset — quotes, comments, lists; nothing else is interpreted',
	static function () {
		$t = Auvyx\Builder\Modules\DesignSystem\DesignMd::yaml( "name: \"A # not a comment\" # comment\ncolors:\n  primary: '#112233'\n  bg: #ffffff\nomitted:\n  - spacing\n  - section: rounded\n    reason: none\nevil: <?php echo 1; ?>\n" );
		auvyx_assert_same( 'A # not a comment', $t['name'] );
		auvyx_assert_same( '#112233', $t['colors']['primary'] );
		auvyx_assert_same( '#ffffff', $t['colors']['bg'], 'a hex is not a comment' );
		auvyx_assert_same( 'spacing', $t['omitted'][0] );
		auvyx_assert_same( '<?php echo 1; ?>', $t['evil'], 'a plain string, never run' );
	}
);

auvyx_test(
	'a theme preset writes background, muted and border into Auvyx tokens (not only the theme palette)',
	static function () {
		$before = get_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION, null );
		Brief::apply(
			array(
				'colors' => array(
					'background' => '#0c0f0d',
					'muted'      => '#9bb3a6',
					'border'     => '#24352c',
					'primary'    => '#3dff8a',
					'text'       => '#e8fff1',
				),
			)
		);
		$tokens = array_column( Auvyx\Builder\Plugin::instance()->module( 'design-system' )->get()['tokens']['color'], 'color', 'slug' );
		auvyx_assert_same( '#0c0f0d', $tokens['auvyx-base'] );
		auvyx_assert_same( '#9bb3a6', $tokens['auvyx-muted'] );
		auvyx_assert_same( '#24352c', $tokens['auvyx-border'] );
		$surface = Brief::surface_css();
		auvyx_assert_contains( '#masthead', $surface, 'the preset paints the theme header' );
		auvyx_assert_contains( '.content-bg', $surface, 'the preset paints the theme content box' );
		auvyx_assert_contains( '#0c0f0d', $surface );
		auvyx_assert_contains( '#e8fff1', $surface );
		$design = Auvyx\Builder\Plugin::instance()->module( 'design-system' );
		auvyx_assert_contains( '--wp--preset--font-size--auvyx-xl:', $design->typography_variable_css() );
		auvyx_assert_contains( '.has-auvyx-xl-font-size{font-size:var(--wp--preset--font-size--auvyx-xl) !important}', $design->typography_utility_css() );
		Brief::clear();
		null === $before ? delete_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION ) : update_option( Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION, $before );
		Auvyx\Builder\Plugin::instance()->module( 'design-system' )->flush();
	}
);

auvyx_test(
	'the Studio applies a DESIGN.md through REST; only users who may change the look can',
	static function () {
		$markdown = "---\nname: Teal\ncolors:\n  primary: \"#0f766e\"\n  on-primary: \"#ffffff\"\n  background: \"#ffffff\"\n  on-background: \"#111827\"\nrounded:\n  md: 8px\n---\nCalm and clear.";
		$editor   = wp_insert_user( array( 'user_login' => 'brief-editor', 'user_pass' => wp_generate_password(), 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/design/brief' );
		$request->set_param( 'markdown', $markdown );
		auvyx_assert_same( 403, rest_do_request( $request )->get_status(), 'an editor cannot' );
		wp_set_current_user( 1 );
		$response = rest_do_request( $request );
		auvyx_assert_same( 200, $response->get_status(), (string) wp_json_encode( $response->get_data() ) );
		auvyx_assert_same( '#0f766e', $response->get_data()['preset']['colors']['primary'] ?? '' );
		auvyx_assert_contains( 'Calm and clear.', \Auvyx\Builder\Modules\DesignSystem\Brief::brief() );
		$empty = new WP_REST_Request( 'POST', '/auvyx/v1/design/brief' );
		$empty->set_param( 'markdown', '  ' );
		auvyx_assert_same( 400, rest_do_request( $empty )->get_status() );
		\Auvyx\Builder\Modules\DesignSystem\Brief::clear();
	}
);

auvyx_test(
	'brief: inline YAML maps (the design tool\'s and site templates\' format) read like nested ones',
	static function () {
		$nested = "---\nname: Soft\ncolors:\n  primary: \"#0f766e\"\ntypography:\n  headline-lg:\n    fontFamily: Fraunces\n    fontSize: 48px\n  body-md:\n    fontFamily: Inter\nrounded:\n  sm: 4px\n  md: 12px\n---\nSoft.";
		$inline = "---\nname: Soft\ncolors:\n  primary: \"#0f766e\"\ntypography:\n  headline-lg: { fontFamily: Fraunces, fontSize: 48px }\n  body-md: { fontFamily: \"Inter\" }\nrounded: { sm: 4px, md: 12px }\n---\nSoft.";
		$a = Brief::from_brief( $nested );
		$b = Brief::from_brief( $inline );
		auvyx_assert_same( $a['fonts'] ?? null, $b['fonts'] ?? null, 'fonts' );
		auvyx_assert_same( $a['radius'] ?? null, $b['radius'] ?? null, 'corners' );
		auvyx_assert_same( '12px', $b['radius'] ?? '' );
	}
);

auvyx_test(
	'brief: rounded buttons are squircles in the theme, pill buttons stay pills',
	static function () {
		auvyx_assert_same( true, \Auvyx\Builder\Modules\Styles\Styles::smooth_corner( '8px' ) );
		auvyx_assert_same( false, \Auvyx\Builder\Modules\Styles\Styles::smooth_corner( '9999px' ) );
	}
);

auvyx_test(
	'brief: button text and dark-band text are two colors (a lime button with dark text, a black band with light text)',
	static function () {
		$md     = "---\ncolors:\n  primary: \"#a3e635\"\n  on-primary: \"#0a0a0a\"\n  background: \"#0a0a0a\"\n  on-background: \"#f5f5f5\"\n  secondary: \"#000000\"\n---\nGadgets.";
		$preset = Brief::from_brief( $md );
		auvyx_assert_same( '#0a0a0a', $preset['colors']['onPrimary'] );
		auvyx_assert_same( '#000000', $preset['colors']['secondary'] );
		auvyx_assert_same( '#ffffff', $preset['colors']['onSecondary'] );
	}
);

auvyx_test(
	'design tool DESIGN.md: elevation, dark scheme and concept are read and sanitized',
	static function () {
		$md     = (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/designmd/system-tidewater.md' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$preset = Brief::from_brief( $md );
		auvyx_assert_same( '#d9480f', $preset['colors']['primary'], 'light values stay as the generator wrote them' );
		auvyx_assert_same( '#e6eef0', $preset['colors']['background'] );
		auvyx_assert_same( '0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a', $preset['shadows']['md'] ?? '' );
		auvyx_assert_same( array( 'sm', 'md', 'lg' ), array_keys( $preset['shadows'] ) );
		auvyx_assert_same(
			array(
				'primary'    => '#ff754a',
				'onPrimary'  => '#111718',
				'background' => '#0d1314',
				'surface'    => '#171d1e',
				'text'       => '#eef7f8',
				'muted'      => '#9ea6a8',
				'border'     => '#2b3233',
			),
			$preset['dark'] ?? null
		);
		auvyx_assert_same( 'A small island ferry line whose timetable board is the whole brand', $preset['concept']['idea'] ?? '' );
		auvyx_assert_same( 'a split-flap departures board with the next crossing', $preset['concept']['signature'] ?? '' );
		auvyx_assert_same( '16px', $preset['spacing']['md'] ?? '' );

		$hard = Brief::from_brief( (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/designmd/system-ledger.md' ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		auvyx_assert_same( '3px 3px 0 0 #13110d', $hard['shadows']['md'] ?? '', 'hard depth' );

		$unsafe = Brief::sanitize(
			array(
				'colors'  => array( 'text' => '#111111' ),
				'shadows' => array(
					'sm' => '0 1px 2px red;}body{display:none',
					'md' => '0 0 4px url(x)',
					'lg' => 'NONE',
				),
				'dark'    => array(
					'background' => 'black;}',
					'text'       => '#FAFAFA',
				),
				'concept' => array( 'idea' => '<script>alert(1)</script>Ferries' ),
			)
		);
		auvyx_assert_same( array( 'lg' => 'none' ), $unsafe['shadows'] );
		auvyx_assert_same( array( 'text' => '#fafafa' ), $unsafe['dark'] );
		auvyx_assert_same( 'Ferries', $unsafe['concept']['idea'] );
		auvyx_assert_same( '', Brief::dark_css( $unsafe ), 'no dark ground, no dark mode' );
	}
);

auvyx_test(
	'design tool DESIGN.md: shadows and spacing become presets, the dark scheme a dark mode; clearing restores',
	static function () {
		$option  = Auvyx\Builder\Modules\DesignSystem\DesignSystem::OPTION;
		$before  = get_option( $option, null );
		$design  = Auvyx\Builder\Plugin::instance()->module( 'design-system' );
		$offline = static fn( $pre, $args, $url ) => false !== strpos( (string) $url, 'fontsource' ) || false !== strpos( (string) $url, 'jsdelivr' ) ? new WP_Error( 'offline', 'offline' ) : $pre;
		add_filter( 'pre_http_request', $offline, 10, 3 );
		$spacing_before = array_column( $design->get()['tokens']['spacing'], 'size', 'slug' );

		Brief::apply( Brief::from_brief( (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/designmd/system-tidewater.md' ) ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$tokens = $design->get()['tokens'];
		auvyx_assert_same( '#d9480f', array_column( $tokens['color'], 'color', 'slug' )['auvyx-primary'] );
		auvyx_assert_same(
			array(
				'auvyx-xs' => '4px',
				'auvyx-sm' => '8px',
				'auvyx-md' => '16px',
				'auvyx-lg' => '32px',
				'auvyx-xl' => '64px',
			),
			array_column( $tokens['spacing'], 'size', 'slug' ),
			'spacing → Auvyx spacing tokens'
		);
		auvyx_assert_same( '0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a', array_column( $tokens['shadow'] ?? array(), 'shadow', 'slug' )['auvyx-lg'] ?? '' );

		// theme.json → --wp--preset--shadow--auvyx-* and --wp--preset--spacing--auvyx-*.
		$theme   = WP_Theme_JSON_Resolver::get_theme_data()->get_data();
		$shadows = array_column( (array) ( $theme['settings']['shadow']['presets'] ?? array() ), 'shadow', 'slug' );
		auvyx_assert_same( '0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a', $shadows['auvyx-sm'] ?? '', 'auvyx-sm in theme.json: ' . wp_json_encode( $theme['settings']['shadow'] ?? null ) );
		$vars = wp_get_global_stylesheet( array( 'variables' ) );
		auvyx_assert_contains( '--wp--preset--shadow--auvyx-md: 0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a', $vars );
		auvyx_assert_contains( '--wp--preset--spacing--auvyx-md: 16px', $vars );

		// The theme's own levels of the same name follow.
		$data = new WP_Theme_JSON_Data(
			array(
				'version'  => 3,
				'settings' => array(
					'shadow' => array(
						'presets' => array(
							array( 'slug' => 'sm', 'name' => 'Small', 'shadow' => 'none' ),
							array( 'slug' => 'deep', 'name' => 'Deep', 'shadow' => '0 0 1px #000' ),
						),
					),
				),
			),
			'theme'
		);
		$list = (array) ( Brief::inject( $data )->get_data()['settings']['shadow']['presets'] ?? array() );
		$own  = array_column( (array) ( $list['theme'] ?? $list ), 'shadow', 'slug' );
		auvyx_assert_same( '0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a', $own['sm'] ?? '', 'the theme\'s sm' );
		auvyx_assert_same( '0 0 1px #000', $own['deep'] ?? '', 'other levels stay' );

		// Dark mode: the color presets under prefers-color-scheme and [data-theme="dark"]; light stays.
		$css = Brief::surface_css();
		auvyx_assert_contains( '--wp--preset--color--auvyx-primary:#d9480f', $css, 'light Auvyx token as before' );
		auvyx_assert_contains( 'body{background-color:#e6eef0!important;}', $css, 'light page as before' );
		auvyx_assert_contains( '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;--wp--preset--color--accent:#ff754a;--wp--preset--color--auvyx-primary:#ff754a;', $css );
		auvyx_assert_contains( '--wp--preset--color--base:#0d1314;--wp--preset--color--auvyx-base:#0d1314', $css );
		auvyx_assert_contains( '--wp--preset--color--contrast:#eef7f8;--wp--preset--color--auvyx-text:#eef7f8', $css );
		auvyx_assert_contains( ':root:not([data-theme="light"]) body{background-color:#0d1314!important;}', $css );
		auvyx_assert_contains( ':root[data-theme="dark"]{color-scheme:dark;', $css );
		auvyx_assert_contains( ':root[data-theme="dark"] .wp-element-button,:root[data-theme="dark"] .wp-block-button__link{background-color:#ff754a;color:#111718;}', $css );
		auvyx_assert_not_contains( '--wp--preset--color--auvyx-secondary:#0d1314;', substr( $css, (int) strpos( $css, '@media' ) ), 'roles without a dark value keep their light one' );
		ob_start();
		Brief::print_surface();
		auvyx_assert_contains( '<style id="auvyx-preset-surface">', (string) ob_get_clean() );

		// The admin shows the concept read-only, the dark scheme and the shadows.
		$html = Brief::details_html( Brief::preset() );
		auvyx_assert_contains( '<dt>Idea</dt><dd>A small island ferry line whose timetable board is the whole brand</dd>', $html );
		auvyx_assert_contains( '#ff754a', $html );
		auvyx_assert_contains( '--wp--preset--shadow--auvyx-md', $html );

		Brief::clear();
		$tokens = $design->get()['tokens'];
		auvyx_assert_same( $spacing_before, array_column( $tokens['spacing'], 'size', 'slug' ), 'spacing back' );
		auvyx_assert_same( false, isset( $tokens['shadow'] ), 'Auvyx shadows gone' );
		auvyx_assert_same( '', Brief::surface_css() );
		remove_filter( 'pre_http_request', $offline, 10 );
		delete_option( Auvyx\Builder\Modules\DesignSystem\Fonts::OPTION );
		null === $before ? delete_option( $option ) : update_option( $option, $before );
		$design->flush();
	}
);

auvyx_test(
	'the design brief route keeps the concept and answers the dark scheme and shadows it applied',
	static function () {
		$offline = static fn( $pre, $args, $url ) => false !== strpos( (string) $url, 'fontsource' ) || false !== strpos( (string) $url, 'jsdelivr' ) ? new WP_Error( 'offline', 'offline' ) : $pre;
		add_filter( 'pre_http_request', $offline, 10, 3 );
		wp_set_current_user( 1 );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/design/brief' );
		$request->set_param( 'markdown', (string) file_get_contents( AUVYX_BUILDER_DIR . 'tests/fixtures/designmd/system-ledger.md' ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$response = rest_do_request( $request );
		auvyx_assert_same( 200, $response->get_status(), (string) wp_json_encode( $response->get_data() ) );
		$preset = $response->get_data()['preset'];
		auvyx_assert_same( 'bone paper with oxblood ruling ink', $preset['concept']['palette'] ?? '' );
		auvyx_assert_same( '#13110d', $preset['dark']['background'] ?? '' );
		auvyx_assert_same( '2px 2px 0 0 #13110d', $preset['shadows']['sm'] ?? '' );
		auvyx_assert_same( 'bone paper with oxblood ruling ink', Brief::preset()['concept']['palette'] ?? '', 'stored with the brief' );
		Brief::clear();
		remove_filter( 'pre_http_request', $offline, 10 );
		delete_option( Auvyx\Builder\Modules\DesignSystem\Fonts::OPTION );
		Auvyx\Builder\Plugin::instance()->module( 'design-system' )->flush();
	}
);
